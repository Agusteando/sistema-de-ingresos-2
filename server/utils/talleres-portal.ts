import { PLANTELES_LIST } from '../../utils/constants'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  canonicalTallerKey,
  finalTallerSeed,
  normalizeServicioClave,
  normalizeServicioNombre,
  parseServiciosCsv,
} from '../../shared/utils/talleresServicios'
import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { fetchControlEscolarStudents, runControlEscolar } from './control-escolar'
import { readFinalTalleresCatalog, updateCentralMatriculaServicio } from './talleres-servicios'

export const TALLERES_PORTAL_PLANTELES = [
  'PREET', 'PREEM', 'PT', 'PM', 'ST', 'SM', 'ISM', 'DM', 'CM', 'CT'
].filter((plantel) => PLANTELES_LIST.includes(plantel))

export const TALLER_DAY_OPTIONS = ['L', 'M', 'MIE', 'J', 'V'] as const
export type TallerDayCode = typeof TALLER_DAY_OPTIONS[number]

const LABELS_TABLE = 'taller_student_day_labels'
const MAX_SEARCH_RESULTS = 50
const ROSTER_CONCURRENCY = 3
const SCHEMA_CACHE_MS = 60_000
let labelsSchemaCache = { checkedAt: 0, ready: false }

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const studentMapKey = (matricula: unknown, servicioClave: unknown) => `${matriculaKey(matricula)}::${canonicalTallerKey(servicioClave)}`
const truthy = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(value ?? '').trim().toLowerCase()) || Number(value) === 1

const normalizeDayCodes = (value: unknown): TallerDayCode[] => {
  const source = Array.isArray(value) ? value : String(value || '').split(',')
  const allowed = new Set<string>(TALLER_DAY_OPTIONS)
  const seen = new Set<string>()
  const result: TallerDayCode[] = []
  for (const item of source) {
    const day = clean(item, 10).toUpperCase().replace(/\./g, '')
    if (!allowed.has(day) || seen.has(day)) continue
    seen.add(day)
    result.push(day as TallerDayCode)
  }
  return result.sort((a, b) => TALLER_DAY_OPTIONS.indexOf(a) - TALLER_DAY_OPTIONS.indexOf(b))
}

const parseJsonDays = (value: unknown) => {
  if (Array.isArray(value)) return normalizeDayCodes(value)
  if (!value) return []
  try {
    return normalizeDayCodes(JSON.parse(String(value)))
  } catch {
    return normalizeDayCodes(value)
  }
}

const labelsTableReady = async (force = false) => {
  if (!force && labelsSchemaCache.checkedAt && Date.now() - labelsSchemaCache.checkedAt < SCHEMA_CACHE_MS) {
    return labelsSchemaCache.ready
  }
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [LABELS_TABLE]
  )
  labelsSchemaCache = { checkedAt: Date.now(), ready: rows.length > 0 }
  return labelsSchemaCache.ready
}

const requireLabelsTable = async () => {
  if (await labelsTableReady()) return
  throw createError({
    statusCode: 503,
    statusMessage: 'TALLER_DAY_LABELS_SCHEMA_MISSING',
    message: `Falta la tabla ${LABELS_TABLE}. Ejecuta primero el SQL manual proporcionado para Portal Tallerista.`
  })
}

const resolveCurrentCiclo = async (requested?: unknown) => {
  const requestedRaw = Array.isArray(requested) ? requested[0] : requested
  if (String(requestedRaw ?? '').trim()) return normalizeCicloKey(requestedRaw as any)

  try {
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT CAST(cycle_name AS CHAR) AS cycle_name, IFNULL(is_current, 0) AS is_current
         FROM config_school_cycles
        ORDER BY IFNULL(is_current, 0) DESC, cycle_name DESC`
    )
    const current = rows.find((row) => Number(row?.is_current || 0) === 1) || rows[0]
    if (String(current?.cycle_name ?? '').trim()) return normalizeCicloKey(current.cycle_name)
  } catch {}

  const year = new Date().getFullYear()
  return String(new Date().getMonth() >= 6 ? year : year - 1)
}

const normalizePortalPlantel = (value: unknown) => {
  const plantel = clean(value, 20).toUpperCase()
  return TALLERES_PORTAL_PLANTELES.includes(plantel) ? plantel : ''
}

const resolveRequestedPlantel = (value: unknown) => {
  const raw = clean(value, 20).toUpperCase()
  if (!raw) return ''
  const plantel = normalizePortalPlantel(raw)
  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'TALLERES_PLANTEL_INVALID', message: 'El plantel no es compatible con Portal Tallerista.' })
  }
  return plantel
}

const readLabelsForStudents = async (matriculas: string[], ciclo: string) => {
  const ready = await labelsTableReady()
  const map = new Map<string, TallerDayCode[]>()
  if (!ready || !matriculas.length) return { ready, map }

  const unique = Array.from(new Set(matriculas.map(matriculaKey).filter(Boolean)))
  for (let offset = 0; offset < unique.length; offset += 250) {
    const chunk = unique.slice(offset, offset + 250)
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT matricula, servicio_clave, dias_json
         FROM ${LABELS_TABLE}
        WHERE ciclo = ?
          AND matricula IN (${chunk.map(() => '?').join(',')})`,
      [ciclo, ...chunk]
    )
    for (const row of rows) map.set(studentMapKey(row.matricula, row.servicio_clave), parseJsonDays(row.dias_json))
  }
  return { ready, map }
}

const readCatalog = async () => {
  const result = await readFinalTalleresCatalog()
  return {
    source: result.source,
    catalog: result.catalog.map((item) => ({
      clave: normalizeServicioClave(item.servicio_clave || item.servicio_nombre),
      nombre: normalizeServicioNombre(item.servicio_nombre),
      imagen: clean(item.imagen_url, 500),
      activo: Number(item.activo || 0) !== 0,
      orden: Number(item.orden || 9999),
    })).filter((item) => item.clave && item.nombre)
  }
}

const makeServiceResolver = (catalog: Awaited<ReturnType<typeof readCatalog>>['catalog']) => {
  const byKey = new Map(catalog.map((item) => [item.clave, item]))
  return (value: unknown) => {
    const rawName = normalizeServicioNombre(value)
    const clave = canonicalTallerKey(rawName)
    const item = byKey.get(clave)
    return {
      clave,
      nombre: item?.nombre || rawName,
      imagen: item?.imagen || '',
      activo: Boolean(item?.activo),
      orden: item?.orden || 9999,
    }
  }
}

const readOnePlantelStudents = async (event: any, plantel: string, ciclo: string, search = '') => {
  return await runControlEscolar(event, plantel, async () => {
    const result = await fetchControlEscolarStudents(plantel, search
      ? { plantel, agentId: plantel, ciclo, cicloKey: ciclo, search, page: 1, limit: 100 }
      : { plantel, agentId: plantel, ciclo, cicloKey: ciclo, all: '1', limit: 10000 })
    return {
      students: Array.isArray(result?.data) ? result.data : [],
      source: result?.source || null,
      total: Number(result?.pagination?.total || result?.data?.length || 0),
    }
  })
}

const runLimited = async <T>(items: string[], worker: (item: string) => Promise<T>) => {
  const result: T[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(ROSTER_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      result[index] = await worker(items[index])
    }
  })
  await Promise.all(workers)
  return result
}

const compactStudent = (student: any, plantel: string, ciclo: string, services: ReturnType<ReturnType<typeof makeServiceResolver>>[], labels: Map<string, TallerDayCode[]>) => {
  const tallerDias: Record<string, TallerDayCode[]> = {}
  const talleres = services.map((service) => {
    const dias = labels.get(studentMapKey(student?.matricula, service.clave)) || []
    tallerDias[service.nombre] = dias
    return { ...service, dias }
  })

  return {
    matricula: matriculaKey(student?.matricula),
    nombreCompleto: clean(student?.nombreCompleto || student?.fullName, 255),
    fullName: clean(student?.fullName || student?.nombreCompleto, 255),
    nombres: clean(student?.nombres, 120),
    apellidoPaterno: clean(student?.apellidoPaterno, 120),
    apellidoMaterno: clean(student?.apellidoMaterno, 120),
    plantel,
    nivel: clean(student?.nivel, 80),
    grado: clean(student?.grado, 80),
    grupo: clean(student?.grupo || student?.group, 80),
    telefonoPadre: clean(student?.telefonoPadre || student?.padre?.telefono, 80),
    telefonoMadre: clean(student?.telefonoMadre || student?.madre?.telefono, 80),
    emailPadre: clean(student?.emailPadre || student?.padre?.correo, 255),
    emailMadre: clean(student?.emailMadre || student?.madre?.correo, 255),
    foto: clean(student?.photoUrl || student?.foto, 1000),
    photoUrl: clean(student?.photoUrl || student?.foto, 1000),
    observaciones: clean(student?.servicioNotas, 1000),
    servicioNotas: clean(student?.servicioNotas, 1000),
    eventual: truthy(student?.eventual) ? 1 : 0,
    ciclo,
    servicios: services.map((service) => service.nombre),
    talleres,
    tallerDias,
  }
}

export const readTalleresPortalMeta = async (requestedCiclo?: unknown) => {
  const ciclo = await resolveCurrentCiclo(requestedCiclo)
  const catalog = await readCatalog()
  return {
    ok: true,
    source: 'aurora',
    ciclo,
    planteles: [...TALLERES_PORTAL_PLANTELES],
    talleres: catalog.catalog,
    catalogSource: catalog.source,
    dayLabelsSchemaReady: await labelsTableReady(),
    dayLabels: [...TALLER_DAY_OPTIONS],
  }
}

export const readTalleresPortalRoster = async (event: any, input: any = {}) => {
  const requested = resolveRequestedPlantel(input.plantel)
  const planteles = requested ? [requested] : [...TALLERES_PORTAL_PLANTELES]
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const catalog = await readCatalog()
  const resolveService = makeServiceResolver(catalog.catalog)

  const loaded = await runLimited(planteles, async (plantel) => {
    try {
      const result = await readOnePlantelStudents(event, plantel, ciclo)
      return { plantel, ...result, error: null }
    } catch (error: any) {
      return { plantel, students: [], source: null, total: 0, error: clean(error?.message || error?.statusMessage || 'No disponible', 1000) }
    }
  })

  if (requested && loaded[0]?.error) {
    throw createError({ statusCode: 502, statusMessage: 'TALLERES_ROSTER_UNAVAILABLE', message: `Aurora no pudo leer ${requested}: ${loaded[0].error}` })
  }
  if (!requested && loaded.length && loaded.every((entry) => entry.error)) {
    throw createError({ statusCode: 502, statusMessage: 'TALLERES_ROSTER_UNAVAILABLE', message: 'Aurora no pudo leer los planteles de Portal Tallerista.' })
  }

  const allMatriculas = loaded.flatMap((entry) => entry.students.map((student: any) => matriculaKey(student?.matricula))).filter(Boolean)
  const labels = await readLabelsForStudents(allMatriculas, ciclo)
  const data: Record<string, Record<string, any[]>> = {}

  for (const entry of loaded) {
    data[entry.plantel] = {}
    for (const rawStudent of entry.students) {
      if (String(rawStudent?.status || '').toLowerCase() === 'baja' || Number(rawStudent?.baja || 0) === 1) continue
      const services = parseServiciosCsv(rawStudent?.servicio).map(resolveService).filter((service) => service.activo && service.clave && service.nombre)
      if (!services.length) continue
      const student = compactStudent(rawStudent, entry.plantel, ciclo, services, labels.map)
      for (const service of services) {
        if (!data[entry.plantel][service.nombre]) data[entry.plantel][service.nombre] = []
        data[entry.plantel][service.nombre].push({ ...student, servicio: service.nombre, servicioClave: service.clave })
      }
    }
  }

  return {
    ok: loaded.some((entry) => !entry.error),
    source: 'aurora',
    ciclo,
    planteles: [...TALLERES_PORTAL_PLANTELES],
    talleres: catalog.catalog,
    catalogSource: catalog.source,
    dayLabelsSchemaReady: labels.ready,
    data,
    meta: {
      sources: loaded.map((entry) => ({ plantel: entry.plantel, ok: !entry.error, total: entry.total, error: entry.error, source: entry.source })),
      generatedAt: new Date().toISOString(),
    }
  }
}

export const searchTalleresPortalStudents = async (event: any, input: any = {}) => {
  const search = clean(input.q || input.search, 120)
  if (search.length < 2) return { ok: true, source: 'aurora', ciclo: await resolveCurrentCiclo(input.ciclo), data: [] }
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const catalog = await readCatalog()
  const resolveService = makeServiceResolver(catalog.catalog)
  const requested = resolveRequestedPlantel(input.plantel)
  const planteles = requested ? [requested] : [...TALLERES_PORTAL_PLANTELES]

  const loaded = await runLimited(planteles, async (plantel) => {
    try {
      const result = await readOnePlantelStudents(event, plantel, ciclo, search)
      return { plantel, ...result, error: null }
    } catch (error: any) {
      return { plantel, students: [], source: null, total: 0, error: clean(error?.message || error?.statusMessage || 'No disponible', 1000) }
    }
  })
  if (requested && loaded[0]?.error) {
    throw createError({ statusCode: 502, statusMessage: 'TALLERES_SEARCH_UNAVAILABLE', message: `Aurora no pudo buscar en ${requested}: ${loaded[0].error}` })
  }
  if (!requested && loaded.length && loaded.every((entry) => entry.error)) {
    throw createError({ statusCode: 502, statusMessage: 'TALLERES_SEARCH_UNAVAILABLE', message: 'Aurora no pudo buscar alumnos en los planteles de Portal Tallerista.' })
  }
  const flattened = loaded.flatMap((entry) => entry.students.map((student: any) => ({ student, plantel: entry.plantel })))
  const labels = await readLabelsForStudents(flattened.map((entry) => matriculaKey(entry.student?.matricula)), ciclo)
  const unique = new Map<string, any>()

  for (const entry of flattened) {
    const mat = matriculaKey(entry.student?.matricula)
    if (!mat || unique.has(mat) || String(entry.student?.status || '').toLowerCase() === 'baja' || Number(entry.student?.baja || 0) === 1) continue
    const services = parseServiciosCsv(entry.student?.servicio).map(resolveService).filter((service) => service.activo && service.clave && service.nombre)
    const student = compactStudent(entry.student, entry.plantel, ciclo, services, labels.map)
    unique.set(mat, student)
    if (unique.size >= MAX_SEARCH_RESULTS) break
  }

  return { ok: true, source: 'aurora', ciclo, data: Array.from(unique.values()), dayLabelsSchemaReady: labels.ready }
}

export const saveTalleresStudentDays = async ({
  matricula,
  plantel,
  ciclo: cicloInput,
  servicio,
  dias,
  updatedBy,
}: {
  matricula: unknown
  plantel: unknown
  ciclo?: unknown
  servicio: unknown
  dias: unknown
  updatedBy?: unknown
}) => {
  await requireLabelsTable()
  const matriculaValue = matriculaKey(matricula)
  const plantelValue = normalizePortalPlantel(plantel)
  const ciclo = await resolveCurrentCiclo(cicloInput)
  const taller = finalTallerSeed(servicio)
  const servicioNombre = taller?.nombre || ''
  const servicioClave = taller?.clave || ''
  const normalizedDays = normalizeDayCodes(dias)

  if (!matriculaValue) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  if (!plantelValue) throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  if (!servicioClave) throw createError({ statusCode: 400, message: 'Selecciona un taller vigente.' })

  await controlEscolarCentralQuery(
    `INSERT INTO ${LABELS_TABLE}
      (ciclo, plantel, matricula, servicio_clave, servicio_nombre, dias_json, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       plantel = VALUES(plantel),
       servicio_nombre = VALUES(servicio_nombre),
       dias_json = VALUES(dias_json),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [ciclo, plantelValue, matriculaValue, servicioClave, servicioNombre, JSON.stringify(normalizedDays), clean(updatedBy, 255) || null]
  )

  return { ok: true, ciclo, plantel: plantelValue, matricula: matriculaValue, servicio: servicioNombre, servicioClave, dias: normalizedDays }
}

const updateStudentWorkshopMetadata = async (matricula: string, eventual: unknown, notas: unknown) => {
  const columns = await getCentralTableColumns('matricula')
  const assignments: string[] = []
  const params: any[] = []
  if (columns.has('eventual') && eventual !== undefined) {
    assignments.push('`eventual` = ?')
    params.push(truthy(eventual) ? 1 : 0)
  }
  if (columns.has('servicio_notas') && notas !== undefined) {
    assignments.push('`servicio_notas` = ?')
    params.push(clean(notas, 1000))
  }
  if (!assignments.length) return
  params.push(matricula)
  await controlEscolarCentralQuery(`UPDATE matricula SET ${assignments.join(', ')} WHERE UPPER(TRIM(matricula)) = ?`, params)
}

export const mutateTalleresStudentWorkshop = async ({
  matricula,
  plantel,
  ciclo: cicloInput,
  servicio,
  action,
  eventual,
  notas,
  updatedBy,
}: {
  matricula: unknown
  plantel: unknown
  ciclo?: unknown
  servicio: unknown
  action: 'add' | 'remove'
  eventual?: unknown
  notas?: unknown
  updatedBy?: unknown
}) => {
  const matriculaValue = matriculaKey(matricula)
  const plantelValue = normalizePortalPlantel(plantel)
  const ciclo = await resolveCurrentCiclo(cicloInput)
  const taller = finalTallerSeed(servicio)
  const servicioNombre = action === 'add' ? (taller?.nombre || '') : normalizeServicioNombre(servicio)
  if (!matriculaValue || !plantelValue || !servicioNombre) throw createError({ statusCode: 400, message: 'Matrícula, plantel y taller son obligatorios.' })
  if (!['add', 'remove'].includes(action)) throw createError({ statusCode: 400, message: 'Acción inválida.' })
  if (action === 'add' && !taller) throw createError({ statusCode: 400, message: 'Selecciona un taller vigente.' })

  const updated = await updateCentralMatriculaServicio({
    matricula: matriculaValue,
    action,
    servicio: servicioNombre,
    userEmail: clean(updatedBy, 255) || null,
  })

  if (action === 'add') await updateStudentWorkshopMetadata(matriculaValue, eventual, notas)
  if (action === 'remove' && await labelsTableReady()) {
    await controlEscolarCentralQuery(
      `DELETE FROM ${LABELS_TABLE} WHERE ciclo = ? AND matricula = ? AND servicio_clave = ?`,
      [ciclo, matriculaValue, canonicalTallerKey(servicioNombre)]
    )
  }

  return { ...updated, ciclo, plantel: plantelValue, matricula: matriculaValue, servicio: servicioNombre }
}
