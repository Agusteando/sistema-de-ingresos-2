import crypto from 'node:crypto'
import { DASHBOARD_PLANTELES } from '../../utils/constants'
import { automaticSchoolCycleKey, normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  canonicalTallerKey,
  normalizeServicioClave,
  normalizeServicioNombre,
  parseServiciosCsv,
  shouldIncludeDirectTallerAssignment,
  shouldIncludeFinancialTallerAssignment,
} from '../../shared/utils/talleresServicios'
import { runWithBridgeAgentId } from './db'
import { controlEscolarCentralQuery, getCentralTableColumns, withControlEscolarCentralConnection } from './control-escolar-central'
import { ensureControlEscolarExternalViewSchema } from './control-escolar-external-view'
import { readAllExternalSnapshotStudents } from './control-escolar-external-snapshot'
import { fetchControlEscolarStudents } from './control-escolar'
import {
  readConceptMappedServiciosForMatriculas,
  updateCentralMatriculaServicio,
  type ConceptMappedServicioAssignment,
} from './talleres-servicios'
import { readTalleresAssignmentSummaries, readTalleresContracts, recordTalleresAssignmentChange } from './talleres-contracts'
import { readAuthoritativeTalleresCatalog } from './talleres-catalog-authority'

const SNAPSHOT_TABLE = 'control_external_student_view'

/**
 * SNAPSHOT CONTRACT
 * -----------------
 * Public consumers always use the stable /api/external/v1/talleres contract.
 * TALLERES_SNAPSHOT_VIEW_VERSION is an INTERNAL storage/payload identifier only;
 * it is not an API version and must never cause consumers to migrate to /v2, /v3, etc.
 *
 * The snapshot exists only to make reads fast. It is not permission to return
 * stale business data. Aurora-managed writes that affect Talleres must refresh
 * the relevant snapshot before they report a successful, current state. Reads
 * that detect an old snapshot refresh synchronously or fail; they never knowingly
 * return the old payload as if it were current.
 */
export const TALLERES_SNAPSHOT_VIEW_VERSION = 'talleres-roster-v2'
export const TALLERES_SNAPSHOT_PLANTELES = [...DASHBOARD_PLANTELES] as string[]
const SNAPSHOT_MAX_ROWS = 10000
const MAX_SEARCH_RESULTS = 50
const DAY_LABELS_TABLE = 'taller_student_day_labels'
const REFRESH_LOCK_PREFIX = 'aurora:talleres-roster:'
const FRESH_HOURS = 12
const EXPIRES_HOURS = 24 * 30

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const hash = (value: unknown) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex')
const truthy = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes'].includes(clean(value, 20).toLowerCase()) || Number(value) === 1
const safeJson = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as any
  try { return JSON.parse(String(value)) } catch { return null }
}
const toIso = (value: unknown) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
const dateHoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000)
const mysqlSecondPrecisionNow = () => {
  const value = new Date()
  value.setMilliseconds(0)
  return value
}
const refreshMinutes = () => {
  const value = Number(process.env.AURORA_TALLERES_SNAPSHOT_REFRESH_MINUTES || 30)
  return Math.max(5, Math.min(180, Number.isFinite(value) ? value : 30))
}

export const canonicalTalleresPlantel = (value: unknown) => {
  const code = clean(value, 20).toUpperCase()
  if (code === 'CM' || code === 'DM') return 'PREEM'
  if (code === 'PMA' || code === 'PMB') return 'PM'
  if (code === 'PREET') return 'CT'
  return TALLERES_SNAPSHOT_PLANTELES.includes(code) ? code : ''
}

const sourceCandidatesFor = (plantel: string) => {
  if (plantel === 'PREEM') return ['CM', 'DM', 'PREEM']
  if (plantel === 'PM') return ['PM', 'PMA', 'PMB']
  if (plantel === 'CT') return ['CT', 'PREET']
  return [plantel]
}

const controlEscolarSnapshotPlantelFor = (plantel: string) => plantel === 'CT' ? 'PREET' : plantel

const resolveCurrentCiclo = async (requested?: unknown) => {
  const raw = Array.isArray(requested) ? requested[0] : requested
  if (clean(raw, 30)) return normalizeCicloKey(raw as any)
  try {
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT CAST(cycle_name AS CHAR) AS cycle_name, IFNULL(is_current, 0) AS is_current
         FROM config_school_cycles
        ORDER BY IFNULL(is_current, 0) DESC, cycle_name DESC`
    )
    const current = rows.find((row) => Number(row?.is_current || 0) === 1) || rows[0]
    if (clean(current?.cycle_name, 30)) return normalizeCicloKey(current.cycle_name)
  } catch {}
  return normalizeCicloKey(automaticSchoolCycleKey())
}

const previousCiclo = (ciclo: string) => /^\d{4}$/.test(ciclo) ? String(Number(ciclo) - 1) : ''
const scopeKeyFor = (plantel: string, ciclo: string) => hash(`${TALLERES_SNAPSHOT_VIEW_VERSION}|${plantel}|${ciclo}`).slice(0, 64)
const conceptHash = hash(TALLERES_SNAPSHOT_VIEW_VERSION).slice(0, 64)

const readCatalog = async () => {
  // The central Aurora catalogue is the only authority. Do not fall back to a
  // compiled seed list: newly created/renamed entries must be visible without a
  // deployment, and a database failure must be visible rather than disguised by
  // an older hardcoded catalogue.
  const authoritative = await readAuthoritativeTalleresCatalog()
  return {
    source: authoritative.source || 'central',
    catalog: (authoritative.catalog || []).map((item: any) => ({
      clave: normalizeServicioClave(item?.clave || item?.servicio_clave || item?.nombre || item?.servicio_nombre),
      nombre: normalizeServicioNombre(item?.nombre || item?.servicio_nombre || item?.clave || item?.servicio_clave),
      imagen: clean(item?.imagen || item?.imagen_url, 500),
      activo: Number(item?.activo ?? 1) !== 0,
      orden: Number(item?.orden || 9999),
      // Kept only for backwards-compatible public v1 response fields.
      tipo: item?.tipo || 'servicio',
    })).filter((item: any) => item.clave && item.nombre && item.activo),
  }
}

const normalizeDays = (value: unknown) => {
  const source = Array.isArray(value) ? value : String(value || '').split(',')
  const allowed = new Set(['L', 'M', 'MIE', 'J', 'V'])
  return Array.from(new Set(source.map((item) => clean(item, 10).toUpperCase().replace(/\./g, '')).filter((item) => allowed.has(item))))
}

const readLabels = async (matriculas: string[], ciclo: string) => {
  const result = new Map<string, string[]>()
  const unique = Array.from(new Set(matriculas.map(matriculaKey).filter(Boolean)))
  if (!unique.length) return { ready: true, result }
  try {
    for (let offset = 0; offset < unique.length; offset += 250) {
      const chunk = unique.slice(offset, offset + 250)
      const rows = await controlEscolarCentralQuery<any[]>(
        `SELECT matricula, servicio_clave, dias_json
           FROM ${DAY_LABELS_TABLE}
          WHERE ciclo = ? AND matricula IN (${chunk.map(() => '?').join(',')})`,
        [ciclo, ...chunk]
      )
      for (const row of rows) {
        let days: any = row?.dias_json
        if (typeof days === 'string') {
          try { days = JSON.parse(days) } catch {}
        }
        result.set(`${matriculaKey(row?.matricula)}::${canonicalTallerKey(row?.servicio_clave)}`, normalizeDays(days))
      }
    }
    return { ready: true, result }
  } catch {
    return { ready: false, result }
  }
}

const assignmentResolver = (catalog: any[]) => {
  const byKey = new Map(catalog.map((item) => [canonicalTallerKey(item.clave || item.nombre), item]))
  return (value: unknown) => {
    const nombre = normalizeServicioNombre(value)
    const clave = canonicalTallerKey(nombre)
    const item = byKey.get(clave)
    return {
      clave,
      nombre: item?.nombre || nombre,
      imagen: item?.imagen || '',
      // Catalogue membership is authoritative. A matrícula/financial string that
      // is not currently present in Aurora's active catalogue cannot invent a
      // workshop/service in the snapshot.
      activo: Boolean(item && item.activo !== false),
      orden: Number(item?.orden || 9999),
      tipo: item?.tipo || 'servicio',
    }
  }
}

const mergeServices = (
  directValues: unknown[],
  financial: ConceptMappedServicioAssignment[],
  resolve: ReturnType<typeof assignmentResolver>,
  history: Record<string, any> = {},
) => {
  const merged = new Map<string, any>()
  const financialKeys = new Set((financial || [])
    .map((assignment) => canonicalTallerKey(assignment?.clave || assignment?.nombre))
    .filter(Boolean))
  const ensure = (value: unknown) => {
    const item = resolve(value)
    if (!item.clave || !item.nombre || !item.activo) return null
    const current = merged.get(item.clave) || {
      ...item,
      fuentes: [] as string[],
      conceptosFinancieros: [] as any[],
    }
    merged.set(item.clave, current)
    return current
  }
  for (const direct of directValues) {
    for (const name of parseServiciosCsv(direct)) {
      if (!shouldIncludeDirectTallerAssignment({ value: name, financialKeys, history })) continue
      const item = ensure(name)
      if (item && !item.fuentes.includes('matricula')) item.fuentes.push('matricula')
    }
  }
  for (const assignment of financial || []) {
    if (!shouldIncludeFinancialTallerAssignment({ value: assignment?.clave || assignment?.nombre, history })) continue
    const item = ensure(assignment?.clave || assignment?.nombre)
    if (!item) continue
    if (!item.fuentes.includes('concepto_financiero')) item.fuentes.push('concepto_financiero')
    for (const evidence of assignment?.conceptosFinancieros || []) {
      if (!item.conceptosFinancieros.some((row: any) => Number(row?.conceptoId || 0) === Number(evidence?.conceptoId || 0))) {
        item.conceptosFinancieros.push(evidence)
      }
    }
  }
  return Array.from(merged.values()).sort((a, b) => Number(a.orden || 9999) - Number(b.orden || 9999) || a.nombre.localeCompare(b.nombre, 'es'))
}

const mergeDefined = (base: any, next: any) => {
  const result = { ...(base || {}) }
  for (const [key, value] of Object.entries(next || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') result[key] = value
  }
  return result
}

type SourceLoad = {
  sourcePlantel: string
  students: any[]
  financialAssignments: Map<string, ConceptMappedServicioAssignment[]>
  mappingCount: number
  evidenceCount: number
  source: any
}

const readSource = async (sourcePlantel: string, ciclo: string): Promise<SourceLoad> => {
  return await runWithBridgeAgentId(sourcePlantel, async () => {
    const result: any = await fetchControlEscolarStudents(sourcePlantel, {
      plantel: sourcePlantel,
      agentId: sourcePlantel,
      ciclo,
      cicloKey: ciclo,
      all: 'snapshot',
      mode: 'snapshot',
      limit: SNAPSHOT_MAX_ROWS,
      search: '',
      q: '',
      status: '',
      grado: '',
      grupo: '',
      group: '',
      quality: '',
      recent: '',
    })
    const students = Array.isArray(result?.data) ? result.data : []
    const financial = await readConceptMappedServiciosForMatriculas({
      matriculas: students.map((student: any) => student?.matricula),
      ciclo,
      plantel: sourcePlantel,
    })
    return {
      sourcePlantel,
      students,
      financialAssignments: financial.result,
      mappingCount: financial.mappingCount,
      evidenceCount: financial.evidenceCount,
      source: result?.source || null,
    }
  })
}

const readCentralControlEscolarSnapshot = async (plantel: string, ciclo: string): Promise<SourceLoad> => {
  const controlEscolarPlantel = controlEscolarSnapshotPlantelFor(plantel)
  const result: any = await readAllExternalSnapshotStudents({
    plantel: controlEscolarPlantel,
    ciclo,
    status: '',
    fresh: '0',
  })
  const students = Array.isArray(result?.data) ? result.data : []
  return {
    sourcePlantel: plantel,
    students,
    financialAssignments: new Map(),
    mappingCount: 0,
    evidenceCount: 0,
    source: {
      type: 'aurora-control-escolar-central-snapshot',
      controlEscolarPlantel,
      generatedAt: result?.meta?.generatedAt || null,
      freshness: result?.meta?.freshness || null,
    },
  }
}

const readSnapshotRows = async (plantel: string, ciclo: string) => {
  await ensureControlEscolarExternalViewSchema()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula, payload_json, generated_at, stale_after, expires_at, updated_at
       FROM ${SNAPSHOT_TABLE}
      WHERE plantel = ? AND ciclo_key = ? AND view_version = ?
      ORDER BY matricula ASC`,
    [plantel, ciclo, TALLERES_SNAPSHOT_VIEW_VERSION]
  )
  const parsed = rows.map((row) => ({ ...row, payload: safeJson(row.payload_json) })).filter((row) => row.payload)
  const marker = parsed.find((row) => row.payload?.snapshotEmpty === true) || null
  const students = parsed.filter((row) => row.payload?.snapshotEmpty !== true).map((row) => row.payload)
  return { rows: parsed, students, marker }
}

const mergeFinalStudent = (current: any, incoming: any) => {
  if (!current) return incoming
  const serviceMap = new Map<string, any>()
  const add = (service: any) => {
    const row = typeof service === 'string' ? { nombre: service } : (service || {})
    const key = canonicalTallerKey(row.clave || row.nombre)
    if (!key) return
    const existing = serviceMap.get(key) || { ...row, clave: key }
    const fuentes = new Set([...(existing.fuentes || []), ...(row.fuentes || [])])
    const conceptos = [...(existing.conceptosFinancieros || [])]
    for (const evidence of row.conceptosFinancieros || []) {
      if (!conceptos.some((item: any) => Number(item?.conceptoId || 0) === Number(evidence?.conceptoId || 0))) conceptos.push(evidence)
    }
    serviceMap.set(key, { ...existing, ...row, clave: key, fuentes: Array.from(fuentes), conceptosFinancieros: conceptos })
  }
  for (const service of current.talleres || current.asignaciones || current.servicios || []) add(service)
  for (const service of incoming.talleres || incoming.asignaciones || incoming.servicios || []) add(service)
  const talleres = Array.from(serviceMap.values())
  const sources = Array.from(new Set([...(current.snapshotSourcePlanteles || []), ...(incoming.snapshotSourcePlanteles || [])]))
  return {
    ...mergeDefined(current, incoming),
    plantel: incoming.plantel || current.plantel,
    servicios: talleres.map((item: any) => item.nombre || item.clave).filter(Boolean),
    talleres,
    asignaciones: talleres,
    snapshotSourcePlanteles: sources,
  }
}

const buildFreshStudents = async (plantel: string, ciclo: string, loads: SourceLoad[], catalog: any[]) => {
  const resolve = assignmentResolver(catalog)
  const aggregate = new Map<string, { base: any, direct: unknown[], financial: ConceptMappedServicioAssignment[], sources: Set<string> }>()

  for (const load of loads) {
    for (const raw of load.students) {
      const mat = matriculaKey(raw?.matricula)
      if (!mat) continue
      const current = aggregate.get(mat) || { base: {}, direct: [], financial: [], sources: new Set<string>() }
      current.base = mergeDefined(current.base, raw)
      current.direct.push(raw?.servicio, raw?.servicios)
      current.financial.push(...(load.financialAssignments.get(mat) || []))
      current.sources.add(load.sourcePlantel)
      aggregate.set(mat, current)
    }
  }

  const matriculas = Array.from(aggregate.keys())
  const [labels, contracts, assignmentSummaries] = await Promise.all([
    readLabels(matriculas, ciclo),
    readTalleresContracts(matriculas),
    readTalleresAssignmentSummaries(matriculas),
  ])

  const result: any[] = []
  for (const [matricula, entry] of aggregate) {
    const contract = contracts.result.get(matricula)
    const joined = assignmentSummaries.result.get(matricula) || {}
    const services = mergeServices(entry.direct, entry.financial, resolve, joined)
    const tallerDias: Record<string, string[]> = {}
    const talleres = services.map((service) => {
      const dias = labels.result.get(`${matricula}::${service.clave}`) || []
      tallerDias[service.nombre] = dias
      return { ...service, dias, joined: joined[service.clave] || null }
    })
    const raw = entry.base
    result.push({
      matricula,
      nombreCompleto: clean(raw?.nombreCompleto || raw?.fullName, 255),
      fullName: clean(raw?.fullName || raw?.nombreCompleto, 255),
      nombres: clean(raw?.nombres, 120),
      apellidoPaterno: clean(raw?.apellidoPaterno, 120),
      apellidoMaterno: clean(raw?.apellidoMaterno, 120),
      plantel,
      nivel: clean(raw?.nivel, 80),
      grado: clean(raw?.grado, 80),
      grupo: clean(raw?.grupo || raw?.group, 80),
      telefonoPadre: clean(raw?.telefonoPadre, 80),
      telefonoMadre: clean(raw?.telefonoMadre, 80),
      emailPadre: clean(raw?.emailPadre, 255),
      emailMadre: clean(raw?.emailMadre, 255),
      foto: clean(raw?.photoUrl || raw?.foto, 1000),
      photoUrl: clean(raw?.photoUrl || raw?.foto, 1000),
      observaciones: contract?.observations || clean(raw?.servicioNotas, 1000),
      servicioNotas: clean(raw?.servicioNotas, 1000),
      contrato: contract?.hasContract ?? null,
      contratoObservaciones: contract?.observations || '',
      contratoActualizadoAt: contract?.updatedAt || null,
      eventual: truthy(raw?.eventual) ? 1 : 0,
      status: String(raw?.status || '').toLowerCase() === 'baja' || Number(raw?.baja || 0) === 1 ? 'withdrawn' : 'active',
      baja: String(raw?.status || '').toLowerCase() === 'baja' || Number(raw?.baja || 0) === 1,
      ciclo,
      servicios: talleres.map((service) => service.nombre),
      talleres,
      asignaciones: talleres.map((service) => ({
        clave: service.clave,
        nombre: service.nombre,
        imagen: service.imagen,
        tipo: service.tipo,
        orden: service.orden,
        fuentes: service.fuentes,
        directa: service.fuentes.includes('matricula'),
        conceptosFinancieros: service.conceptosFinancieros,
        dias: service.dias,
        joined: service.joined,
      })),
      asignacionesCompletas: true,
      tallerDias,
      joined,
      snapshotSourcePlanteles: Array.from(entry.sources),
      snapshotViewVersion: TALLERES_SNAPSHOT_VIEW_VERSION,
    })
  }
  return { students: result, labelsReady: labels.ready, contractsReady: contracts.ready, assignmentHistoryReady: assignmentSummaries.ready }
}

const searchTextFor = (student: any) => [
  student?.matricula,
  student?.nombreCompleto,
  student?.fullName,
  student?.nombres,
  student?.apellidoPaterno,
  student?.apellidoMaterno,
  student?.plantel,
  student?.nivel,
  student?.grado,
  student?.grupo,
].map((value) => clean(value, 500).toLowerCase()).filter(Boolean).join(' ').slice(0, 4000)

const writeSnapshot = async (plantel: string, ciclo: string, students: any[], sourceMeta: any) => {
  await ensureControlEscolarExternalViewSchema()
  const previous = await readSnapshotRows(plantel, ciclo)

  // An authoritative empty result is a real state transition, not a reason to
  // retain old members. Persist an explicit empty marker so removed assignments
  // cannot survive indefinitely in a "protective" stale snapshot.
  const generatedAt = mysqlSecondPrecisionNow()
  const staleAfter = dateHoursFromNow(FRESH_HOURS)
  const expiresAt = dateHoursFromNow(EXPIRES_HOURS)
  const scopeKey = scopeKeyFor(plantel, ciclo)
  const rows = students.length ? students : [{
    snapshotEmpty: true,
    plantel,
    ciclo,
    snapshotSourcePlanteles: sourceMeta?.successfulSources || [],
    snapshotViewVersion: TALLERES_SNAPSHOT_VIEW_VERSION,
  }]

  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200)
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')
    const params: any[] = []
    chunk.forEach((student, index) => {
      const isMarker = student?.snapshotEmpty === true
      const matricula = isMarker ? `__EMPTY__${plantel}` : matriculaKey(student?.matricula)
      const payloadJson = JSON.stringify({ ...student, snapshotMeta: sourceMeta })
      params.push(
        scopeKey,
        plantel,
        ciclo,
        previousCiclo(ciclo),
        conceptHash,
        'TALLERES',
        TALLERES_SNAPSHOT_VIEW_VERSION,
        matricula || `__ROW__${offset + index}`,
        isMarker ? '' : clean(student?.nombreCompleto || student?.fullName, 255),
        isMarker ? '' : clean(student?.nivel, 80),
        isMarker ? '' : clean(student?.grado, 80).toLowerCase(),
        isMarker ? '' : clean(student?.grupo, 80),
        isMarker ? '' : clean(student?.status, 80),
        isMarker ? '' : (student?.baja ? 'baja' : 'inscrito'),
        '',
        isMarker ? '' : searchTextFor(student),
        payloadJson,
        hash(payloadJson),
        generatedAt,
        generatedAt,
        staleAfter,
        expiresAt,
      )
    })
    await controlEscolarCentralQuery(
      `INSERT INTO ${SNAPSHOT_TABLE}
        (scope_key, plantel, ciclo_key, previous_ciclo, concept_hash, concept_ids, view_version,
         matricula, nombre_completo, nivel, grado, grupo, status, enrollment_state, tipo_ingreso,
         search_text, payload_json, payload_hash, generated_at, payload_changed_at, stale_after, expires_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         plantel=VALUES(plantel), ciclo_key=VALUES(ciclo_key), previous_ciclo=VALUES(previous_ciclo),
         concept_hash=VALUES(concept_hash), concept_ids=VALUES(concept_ids), view_version=VALUES(view_version),
         nombre_completo=VALUES(nombre_completo), nivel=VALUES(nivel), grado=VALUES(grado), grupo=VALUES(grupo),
         status=VALUES(status), enrollment_state=VALUES(enrollment_state), tipo_ingreso=VALUES(tipo_ingreso),
         search_text=VALUES(search_text), payload_json=VALUES(payload_json),
         payload_changed_at=IF(payload_hash <> VALUES(payload_hash), CURRENT_TIMESTAMP, payload_changed_at),
         payload_hash=VALUES(payload_hash), generated_at=VALUES(generated_at), stale_after=VALUES(stale_after),
         expires_at=VALUES(expires_at), updated_at=CURRENT_TIMESTAMP`,
      params
    )
  }

  await controlEscolarCentralQuery(
    `DELETE FROM ${SNAPSHOT_TABLE}
      WHERE plantel = ? AND ciclo_key = ? AND view_version = ? AND generated_at < ?`,
    [plantel, ciclo, TALLERES_SNAPSHOT_VIEW_VERSION, generatedAt]
  )

  return {
    success: true,
    plantel,
    ciclo,
    rows: students.length,
    generatedAt: generatedAt.toISOString(),
    staleAfter: staleAfter.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }
}

export const refreshTalleresSnapshotPlantel = async (input: { plantel: unknown, ciclo?: unknown, force?: boolean }) => {
  const plantel = canonicalTalleresPlantel(input.plantel)
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'TALLERES_PLANTEL_INVALID', message: 'Plantel inválido para el snapshot de Talleres.' })
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const lockName = `${REFRESH_LOCK_PREFIX}${plantel}:${ciclo}`.slice(0, 64)

  return await withControlEscolarCentralConnection(async (connection) => {
    const [lockRows]: any = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName])
    if (Number(lockRows?.[0]?.acquired || 0) !== 1) return { success: true, skipped: true, reason: 'refresh_in_progress', plantel, ciclo }
    try {
      const previous = await readSnapshotRows(plantel, ciclo)
      if (!input.force && previous.rows.length) {
        const generatedAt = previous.rows[0]?.generated_at ? new Date(previous.rows[0].generated_at).getTime() : 0
        if (generatedAt && generatedAt >= Date.now() - refreshMinutes() * 60 * 1000) {
          return { success: true, skipped: true, reason: 'fresh', plantel, ciclo, rows: previous.students.length, generatedAt: toIso(previous.rows[0]?.generated_at) }
        }
      }

      const catalog = await readCatalog()
      const loads: SourceLoad[] = []
      const failedSources: Array<{ sourcePlantel: string, message: string }> = []
      const preservedSources: string[] = []
      const sourceCandidates = sourceCandidatesFor(plantel)

      for (const sourcePlantel of sourceCandidates) {
        try {
          const load = await readSource(sourcePlantel, ciclo)
          loads.push(load)
        } catch (error: any) {
          failedSources.push({ sourcePlantel, message: clean(error?.message || error?.statusMessage || 'No disponible', 500) })
          const hadPrevious = previous.students.some((student) => (student?.snapshotSourcePlanteles || []).includes(sourcePlantel))
          if (hadPrevious) preservedSources.push(sourcePlantel)
        }
      }

      const loadedStudentRows = loads.reduce((total, load) => total + load.students.length, 0)
      if (!loadedStudentRows) {
        try {
          const centralSnapshot = await readCentralControlEscolarSnapshot(plantel, ciclo)
          if (centralSnapshot.students.length) loads.push(centralSnapshot)
        } catch (error: any) {
          failedSources.push({
            sourcePlantel: 'central-control-escolar-snapshot',
            message: clean(error?.message || error?.statusMessage || 'Snapshot central no disponible', 500),
          })
        }
      }

      const availableStudentRows = loads.reduce((total, load) => total + load.students.length, 0)

      // Never repackage known-old source rows with a new generated_at. If a
      // source that previously contributed students is unavailable now, the
      // refresh cannot prove currentness and must fail instead of preserving it.
      const failedPreviousSources = failedSources
        .map((row) => row.sourcePlantel)
        .filter((sourcePlantel) => previous.students.some((student) =>
          (student?.snapshotSourcePlanteles || []).includes(sourcePlantel)))
      if (failedPreviousSources.length) {
        throw createError({
          statusCode: 503,
          statusMessage: 'TALLERES_SNAPSHOT_SOURCE_NOT_CURRENT',
          message: `No se pudo verificar información vigente de ${plantel}.`,
          data: { plantel, ciclo, failedSources, failedPreviousSources },
        })
      }

      if (!availableStudentRows && failedSources.length && !loads.length) {
        throw createError({ statusCode: 502, statusMessage: 'TALLERES_SNAPSHOT_SOURCE_UNAVAILABLE', message: `No se pudo crear el snapshot de ${plantel}.`, data: { plantel, ciclo, failedSources } })
      }

      const fresh = await buildFreshStudents(plantel, ciclo, loads, catalog.catalog)
      const merged = new Map<string, any>()
      for (const student of fresh.students) merged.set(matriculaKey(student?.matricula), student)

      const sourceMeta = {
        canonicalPlantel: plantel,
        sourceCandidates,
        successfulSources: loads.map((load) => load.sourcePlantel),
        preservedSources: [],
        failedSources,
        sources: loads.map((load) => ({
          plantel: load.sourcePlantel,
          rows: load.students.length,
          conceptosMapeados: load.mappingCount,
          evidenciasFinancieras: load.evidenceCount,
          source: load.source,
        })),
        labelsReady: fresh.labelsReady,
        contractsReady: fresh.contractsReady,
        assignmentHistoryReady: fresh.assignmentHistoryReady,
      }

      return await writeSnapshot(plantel, ciclo, Array.from(merged.values()), sourceMeta)
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]).catch(() => null)
    }
  })
}

export const invalidateTalleresSnapshotPlantel = async (input: { plantel: unknown, ciclo?: unknown }) => {
  const plantel = canonicalTalleresPlantel(input.plantel)
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'TALLERES_PLANTEL_INVALID', message: 'Plantel inválido para el snapshot de Talleres.' })
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  await ensureControlEscolarExternalViewSchema()
  await controlEscolarCentralQuery(
    `UPDATE ${SNAPSHOT_TABLE}
        SET stale_after = LEAST(COALESCE(stale_after, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
      WHERE plantel = ? AND ciclo_key = ? AND view_version = ?`,
    [plantel, ciclo, TALLERES_SNAPSHOT_VIEW_VERSION]
  )
  return { success: true, invalidated: true, plantel, ciclo }
}

export const invalidateTalleresSnapshots = async (input: { ciclo?: unknown, planteles?: unknown[] } = {}) => {
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const requested = Array.isArray(input.planteles) && input.planteles.length
    ? input.planteles.map(canonicalTalleresPlantel).filter(Boolean)
    : [...TALLERES_SNAPSHOT_PLANTELES]
  const planteles = Array.from(new Set(requested))
  const results = []
  for (const plantel of planteles) results.push(await invalidateTalleresSnapshotPlantel({ plantel, ciclo }))
  return { success: true, invalidated: true, ciclo, results }
}

const snapshotCurrent = (snapshot: Awaited<ReturnType<typeof readSnapshotRows>>) => {
  const first = snapshot.rows[0]
  if (!first) return false
  const generatedAt = first?.generated_at ? new Date(first.generated_at).getTime() : 0
  const staleAfter = first?.stale_after ? new Date(first.stale_after).getTime() : 0
  return Boolean(
    generatedAt
    && generatedAt >= Date.now() - refreshMinutes() * 60 * 1000
    && staleAfter > Date.now()
  )
}

/**
 * Ensures the ready-to-serve Talleres snapshot is current before returning.
 * This helper waits through a concurrent refresh lock instead of falling back
 * to an older payload. It is the mutation/read consistency barrier.
 */
export const ensureCurrentTalleresSnapshotPlantel = async (input: { plantel: unknown, ciclo?: unknown, force?: boolean }) => {
  const plantel = canonicalTalleresPlantel(input.plantel)
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'TALLERES_PLANTEL_INVALID', message: 'Plantel inválido para el snapshot de Talleres.' })
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const startedAt = Date.now()
  let lastResult: any = null

  // Force means the caller knows a mutation happened (or has detected an old
  // payload). Invalidate first so a failed rebuild can never leave the previous
  // snapshot looking current to another reader.
  if (input.force !== false) {
    await invalidateTalleresSnapshotPlantel({ plantel, ciclo })
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastResult = await refreshTalleresSnapshotPlantel({ plantel, ciclo, force: input.force !== false })
    if (lastResult?.reason === 'refresh_in_progress') {
      await new Promise((resolve) => setTimeout(resolve, 500))
      continue
    }

    const snapshot = await readSnapshotRows(plantel, ciclo)
    if (snapshotCurrent(snapshot)) {
      return {
        success: true,
        current: true,
        plantel,
        ciclo,
        rows: snapshot.students.length,
        generatedAt: toIso(snapshot.rows[0]?.generated_at),
        waitedMs: Date.now() - startedAt,
        refresh: lastResult,
      }
    }

    // A completed refresh that cannot produce a current payload is a hard
    // consistency failure. Do not expose the older snapshot.
    throw createError({
      statusCode: 503,
      statusMessage: 'TALLERES_SNAPSHOT_NOT_CURRENT',
      message: `Aurora no pudo verificar un snapshot vigente de ${plantel}.`,
      data: { plantel, ciclo, refresh: lastResult },
    })
  }

  throw createError({
    statusCode: 503,
    statusMessage: 'TALLERES_SNAPSHOT_REFRESH_TIMEOUT',
    message: `Aurora no pudo confirmar el snapshot vigente de ${plantel} dentro del tiempo esperado.`,
    data: { plantel, ciclo, refresh: lastResult },
  })
}

export const ensureCurrentTalleresSnapshots = async (input: { ciclo?: unknown, planteles?: unknown[] } = {}) => {
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const requested = Array.isArray(input.planteles) && input.planteles.length
    ? input.planteles.map(canonicalTalleresPlantel).filter(Boolean)
    : [...TALLERES_SNAPSHOT_PLANTELES]
  const planteles = Array.from(new Set(requested))
  const results = []
  for (const plantel of planteles) {
    results.push(await ensureCurrentTalleresSnapshotPlantel({ plantel, ciclo, force: true }))
  }
  return { success: true, current: true, ciclo, results, refreshed: results.length }
}

export const refreshTalleresSnapshots = async (input: { ciclo?: unknown, force?: boolean, planteles?: unknown[] } = {}) => {
  const ciclo = await resolveCurrentCiclo(input.ciclo)
  const requested = Array.isArray(input.planteles) && input.planteles.length
    ? input.planteles.map(canonicalTalleresPlantel).filter(Boolean)
    : [...TALLERES_SNAPSHOT_PLANTELES]
  const planteles = Array.from(new Set(requested))
  const results: any[] = []
  const failures: any[] = []
  for (let index = 0; index < planteles.length; index += 1) {
    const plantel = planteles[index]
    try {
      results.push(await refreshTalleresSnapshotPlantel({ plantel, ciclo, force: input.force }))
    } catch (error: any) {
      failures.push({ plantel, code: clean(error?.statusMessage || error?.code, 120), message: clean(error?.message || 'No se pudo refrescar.', 500) })
    }
    if (index < planteles.length - 1) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return { success: failures.length === 0, ciclo, results, failures, refreshed: results.filter((row) => !row?.skipped).length }
}

const serviceEntriesForStudent = (student: any) => {
  const source = Array.isArray(student?.talleres) && student.talleres.length
    ? student.talleres
    : (Array.isArray(student?.asignaciones) ? student.asignaciones : [])
  if (source.length) return source
  return (Array.isArray(student?.servicios) ? student.servicios : []).map((nombre: string) => ({ nombre, clave: canonicalTallerKey(nombre) }))
}

const buildRosterFromSnapshots = async (planteles: string[], ciclo: string) => {
  const catalog = await readCatalog()
  const data: Record<string, Record<string, any[]>> = {}
  const students: any[] = []
  const sources: any[] = []

  for (const plantel of planteles) {
    let snapshot = await readSnapshotRows(plantel, ciclo)

    // SNAPSHOT CONTRACT: serve the prebuilt payload only when it is current.
    // If it is missing/old, rebuild synchronously before responding. Never start
    // a background refresh and then hand the caller the known-old payload.
    if (!snapshotCurrent(snapshot)) {
      await ensureCurrentTalleresSnapshotPlantel({ plantel, ciclo, force: true })
      snapshot = await readSnapshotRows(plantel, ciclo)
    }
    if (!snapshotCurrent(snapshot)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'TALLERES_SNAPSHOT_NOT_CURRENT',
        message: `Aurora no tiene un snapshot vigente de ${plantel}.`,
        data: { plantel, ciclo },
      })
    }

    data[plantel] = {}
    const available = true
    for (const student of snapshot.students) {
      students.push(student)
      for (const service of serviceEntriesForStudent(student)) {
        const name = normalizeServicioNombre(service?.nombre || service?.clave)
        if (!name) continue
        data[plantel][name] ||= []
        data[plantel][name].push({ ...student, servicio: name, servicioClave: service?.clave || canonicalTallerKey(name) })
      }
    }
    const first = snapshot.rows[0]
    sources.push({
      plantel,
      ok: available,
      total: snapshot.students.length,
      error: available ? null : 'No existe todavía un snapshot verificado para este plantel.',
      source: available ? `mysql:${SNAPSHOT_TABLE}:${TALLERES_SNAPSHOT_VIEW_VERSION}` : null,
      generatedAt: toIso(first?.generated_at),
      staleAfter: toIso(first?.stale_after),
      expiresAt: toIso(first?.expires_at),
      freshness: 'fresh',
      refreshFailure: null,
    })
  }

  return {
    ok: sources.some((source) => source.ok),
    source: 'aurora-mysql-snapshot',
    ciclo,
    planteles,
    catalog: catalog.catalog,
    talleres: catalog.catalog.filter((item) => item.tipo === 'taller'),
    servicios: catalog.catalog.filter((item) => item.tipo === 'servicio'),
    catalogSource: catalog.source,
    assignmentResolution: {
      complete: sources.every((source) => source.ok),
      policy: 'materialized-union',
      sources: ['matricula', 'concepto_financiero'],
      snapshot: TALLERES_SNAPSHOT_VIEW_VERSION,
    },
    dayLabelsSchemaReady: true,
    students,
    data,
    meta: { sources, generatedAt: new Date().toISOString(), snapshotViewVersion: TALLERES_SNAPSHOT_VIEW_VERSION },
  }
}

export const readTalleresSnapshotRoster = async (input: any = {}) => {
  const requestedRaw = clean(input?.plantel, 20)
  const requested = requestedRaw ? canonicalTalleresPlantel(requestedRaw) : ''
  if (requestedRaw && !requested) throw createError({ statusCode: 400, statusMessage: 'TALLERES_PLANTEL_INVALID', message: 'El plantel no forma parte del tablero oficial de Aurora.' })
  const ciclo = await resolveCurrentCiclo(input?.ciclo)
  const planteles = requested ? [requested] : [...TALLERES_SNAPSHOT_PLANTELES]
  const result = await buildRosterFromSnapshots(planteles, ciclo)
  if (requested && result.meta.sources[0]?.ok === false) {
    const source = result.meta.sources[0]
    throw createError({
      statusCode: 502,
      statusMessage: 'TALLERES_SNAPSHOT_UNAVAILABLE',
      message: `Aurora todavía no tiene un snapshot disponible de ${requested}.`,
      data: { plantel: requested, ciclo, refreshFailure: source?.refreshFailure || null },
    })
  }
  if (!requested && !result.ok) {
    throw createError({ statusCode: 502, statusMessage: 'TALLERES_SNAPSHOT_UNAVAILABLE', message: 'Aurora todavía no tiene un snapshot de Talleres disponible.' })
  }
  return result
}

export const searchTalleresSnapshotStudents = async (input: any = {}) => {
  const q = clean(input?.q || input?.search, 120).toLowerCase()
  if (q.length < 2) return { ok: true, source: 'aurora-mysql-snapshot', ciclo: await resolveCurrentCiclo(input?.ciclo), data: [] }
  const roster = await readTalleresSnapshotRoster({ plantel: input?.plantel, ciclo: input?.ciclo })
  const unique = new Map<string, any>()
  for (const student of roster.students || []) {
    const haystack = [student?.matricula, student?.nombreCompleto, student?.fullName, student?.nombres, student?.apellidoPaterno, student?.apellidoMaterno]
      .map((value) => clean(value, 500).toLowerCase()).join(' ')
    if (!haystack.includes(q)) continue
    const mat = matriculaKey(student?.matricula)
    if (mat && !unique.has(mat)) unique.set(mat, student)
    if (unique.size >= MAX_SEARCH_RESULTS) break
  }
  return {
    ok: true,
    source: roster.source,
    ciclo: roster.ciclo,
    data: Array.from(unique.values()),
    assignmentResolution: roster.assignmentResolution,
    meta: roster.meta,
    dayLabelsSchemaReady: roster.dayLabelsSchemaReady,
  }
}

export const readTalleresSnapshotMeta = async (requestedCiclo?: unknown) => {
  const ciclo = await resolveCurrentCiclo(requestedCiclo)
  const catalog = await readCatalog()
  const sources: any[] = []
  for (const plantel of TALLERES_SNAPSHOT_PLANTELES) {
    const snapshot = await readSnapshotRows(plantel, ciclo)
    const first = snapshot.rows[0]
    sources.push({ plantel, ready: snapshot.rows.length > 0, rows: snapshot.students.length, generatedAt: toIso(first?.generated_at), staleAfter: toIso(first?.stale_after) })
  }
  return {
    ok: true,
    source: 'aurora-mysql-snapshot',
    ciclo,
    planteles: [...TALLERES_SNAPSHOT_PLANTELES],
    catalog: catalog.catalog,
    talleres: catalog.catalog.filter((item) => item.tipo === 'taller'),
    servicios: catalog.catalog.filter((item) => item.tipo === 'servicio'),
    catalogSource: catalog.source,
    assignmentResolution: { policy: 'materialized-union', sources: ['matricula', 'concepto_financiero'], snapshot: TALLERES_SNAPSHOT_VIEW_VERSION },
    dayLabelsSchemaReady: true,
    dayLabels: ['L', 'M', 'MIE', 'J', 'V'],
    snapshot: { viewVersion: TALLERES_SNAPSHOT_VIEW_VERSION, sources },
  }
}

const resolveCatalogItem = async (value: unknown) => {
  const key = canonicalTallerKey(value)
  const catalog = await readCatalog()
  return catalog.catalog.find((item) => canonicalTallerKey(item.clave || item.nombre) === key) || null
}

export const saveTalleresSnapshotStudentDays = async ({ matricula, plantel, ciclo: cicloInput, servicio, dias, updatedBy }: any) => {
  const matriculaValue = matriculaKey(matricula)
  const plantelValue = canonicalTalleresPlantel(plantel)
  const ciclo = await resolveCurrentCiclo(cicloInput)
  const item = await resolveCatalogItem(servicio)
  if (!matriculaValue) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  if (!plantelValue) throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  if (!item?.clave) throw createError({ statusCode: 400, message: 'Selecciona un taller o servicio vigente.' })
  const normalizedDays = normalizeDays(dias)
  await controlEscolarCentralQuery(
    `INSERT INTO ${DAY_LABELS_TABLE} (ciclo, plantel, matricula, servicio_clave, servicio_nombre, dias_json, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE plantel=VALUES(plantel), servicio_nombre=VALUES(servicio_nombre), dias_json=VALUES(dias_json), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
    [ciclo, plantelValue, matriculaValue, item.clave, item.nombre, JSON.stringify(normalizedDays), clean(updatedBy, 255) || null]
  )
  return { ok: true, ciclo, plantel: plantelValue, matricula: matriculaValue, servicio: item.nombre, servicioClave: item.clave, dias: normalizedDays, snapshotRefreshRequired: true }
}

export const mutateTalleresSnapshotStudentWorkshop = async ({ matricula, plantel, ciclo: cicloInput, servicio, action, eventual, notas, updatedBy }: any) => {
  const matriculaValue = matriculaKey(matricula)
  const plantelValue = canonicalTalleresPlantel(plantel)
  const ciclo = await resolveCurrentCiclo(cicloInput)
  if (!matriculaValue || !plantelValue) throw createError({ statusCode: 400, message: 'Matrícula y plantel son obligatorios.' })
  if (!['add', 'remove'].includes(action)) throw createError({ statusCode: 400, message: 'Acción inválida.' })
  const item = action === 'add' ? await resolveCatalogItem(servicio) : { clave: canonicalTallerKey(servicio), nombre: normalizeServicioNombre(servicio) }
  if (!item?.clave || !item?.nombre) throw createError({ statusCode: 400, message: 'Selecciona un taller o servicio vigente.' })

  const updated = await updateCentralMatriculaServicio({ matricula: matriculaValue, action, servicio: item.nombre, userEmail: clean(updatedBy, 255) || null })
  if (action === 'add') {
    const columns = await getCentralTableColumns('matricula')
    const assignments: string[] = []
    const params: any[] = []
    if (columns.has('eventual') && eventual !== undefined) { assignments.push('`eventual` = ?'); params.push(truthy(eventual) ? 1 : 0) }
    if (columns.has('servicio_notas') && notas !== undefined) { assignments.push('`servicio_notas` = ?'); params.push(clean(notas, 1000)) }
    if (assignments.length) {
      params.push(matriculaValue)
      await controlEscolarCentralQuery(`UPDATE matricula SET ${assignments.join(', ')} WHERE UPPER(TRIM(matricula)) = ?`, params)
    }
  } else {
    await controlEscolarCentralQuery(`DELETE FROM ${DAY_LABELS_TABLE} WHERE ciclo = ? AND matricula = ? AND servicio_clave = ?`, [ciclo, matriculaValue, item.clave]).catch(() => null)
  }

  if (updated.changed) {
    await recordTalleresAssignmentChange({
      matricula: matriculaValue,
      plantel: plantelValue,
      workshopKey: item.clave,
      workshopName: item.nombre,
      action: action === 'add' ? 'assigned' : 'removed',
      actorEmail: updatedBy,
      metadata: { source: 'aurora_portal_snapshot_v2' },
    })
  }
  return { ...updated, ciclo, plantel: plantelValue, matricula: matriculaValue, servicio: item.nombre, snapshotRefreshRequired: true }
}
