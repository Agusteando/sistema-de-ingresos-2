import { query, executeStatementTransaction, type SqlStatement } from './db'
import { controlEscolarCentralQuery, getControlEscolarCentralDb, getCentralTableColumns } from './control-escolar-central'
import { getTrustedAuthUser, type AuthSessionUser } from './auth-session'
import { normalizeCicloKey } from '../../shared/utils/ciclo'

export const CONCEPTO_CATEGORIES = [
  { key: 'regular', legacyKey: 'planteles', label: 'Inscripción', order: 10 },
  { key: 'talleres_servicios', legacyKey: 'planteles_talleres_servicios', label: 'Talleres y Servicios', order: 20 },
  { key: 'servicio_global', legacyKey: 'serviciosGlobales', label: 'Servicio global', order: 25 },
  { key: 'curso_verano', legacyKey: 'planteles_curso_verano', label: 'Curso de Verano', order: 30 },
  { key: 'mensual_baja4', legacyKey: 'planteles_mensual_baja4', label: 'Mensual baja 4', order: 40 },
  { key: 'issste', legacyKey: 'planteles_issste', label: 'ISSSTE', order: 50 },
  { key: 'otro', legacyKey: 'planteles_otro', label: 'Otro', order: 999 }
]

export const DEFAULT_PLANTELES = ['PT', 'PM', 'ST', 'SM', 'PREET', 'PREEM']

export type ConceptosConfigRow = {
  id: number
  cycle_name: string
  plantel: string
  concepto_id: number
  concepto_nombre: string
  enrollment_type: string
  months_json?: string | null
  servicio_clave?: string | null
  servicio_nombre?: string | null
  activo?: number | boolean | null
  sync_version?: number | string | null
  updated_at?: string | null
  updated_by?: string | null
}

type CycleRow = { cycle_name: string; is_current: number | boolean }
type ConceptRow = {
  id: number
  concepto: string
  ciclo_escolar?: string | null
  ciclo?: string | null
  costo?: number | string | null
  montoFinal?: number | string | null
  monto_final?: number | string | null
  meses?: number | string | null
  plazo?: string | null
  eventual?: number | boolean | null
  image_url?: string | null
  imagen_url?: string | null
}

const normalizeText = (value: unknown, maxLength = 255) => String(value ?? '').trim().slice(0, maxLength)
const normalizePlantel = (value: unknown) => normalizeText(value, 40).toUpperCase()
const normalizeCategory = (value: unknown) => {
  const raw = normalizeText(value || 'regular', 80).toLowerCase()
  if (raw === 'inscripcion' || raw === 'regular') return 'regular'
  if (raw === 'talleres' || raw === 'talleres_y_servicios') return 'talleres_servicios'
  return CONCEPTO_CATEGORIES.some((entry) => entry.key === raw) ? raw : 'otro'
}
const normalizeServiceKey = (value: unknown) => normalizeText(value, 120)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

const parseMonths = (value: unknown) => {
  if (Array.isArray(value)) return value.map((entry) => normalizeText(entry, 20)).filter(Boolean)
  const raw = normalizeText(value, 1000)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeText(entry, 20)).filter(Boolean) : []
  } catch {
    return raw.split(',').map((entry) => normalizeText(entry, 20)).filter(Boolean)
  }
}

const stringifyMonths = (value: unknown) => JSON.stringify(parseMonths(value))
const isActive = (value: unknown) => value === undefined || value === null ? true : Number(value) !== 0

export const canManageConceptosConfig = (user: AuthSessionUser) => {
  if (user.isSuperAdmin) return true
  return user.roles.some((role) => ['admin', 'role_admin', 'conceptos_admin', 'role_conceptos'].includes(String(role || '').toLowerCase()))
}

export const requireConceptosAdmin = async (event: any) => {
  const user = await getTrustedAuthUser(event)
  if (!canManageConceptosConfig(user)) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede modificar esta configuración.' })
  }
  return user
}

const categoryFor = (key: unknown) => CONCEPTO_CATEGORIES.find((entry) => entry.key === normalizeCategory(key)) || CONCEPTO_CATEGORIES[CONCEPTO_CATEGORIES.length - 1]

const normalizeMappingRow = (row: any): ConceptosConfigRow => ({
  id: Number(row.id || 0),
  cycle_name: normalizeCicloKey(row.cycle_name || row.ciclo || row.ciclo_escolar),
  plantel: normalizePlantel(row.plantel),
  concepto_id: Number(row.concepto_id || 0),
  concepto_nombre: normalizeText(row.concepto_nombre || row.concepto || row.servicio_nombre || 'Sin concepto'),
  enrollment_type: normalizeCategory(row.enrollment_type || row.categoria || row.categoria_clave || 'regular'),
  months_json: normalizeText(row.months_json || '[]', 1000) || '[]',
  servicio_clave: normalizeText(row.servicio_clave, 120) || null,
  servicio_nombre: normalizeText(row.servicio_nombre, 160) || null,
  activo: isActive(row.activo) ? 1 : 0,
  sync_version: Number(row.sync_version || 1),
  updated_at: row.updated_at || null,
  updated_by: row.updated_by || null
})

const normalizeConceptRow = (row: any): ConceptRow => ({
  id: Number(row.id || 0),
  concepto: normalizeText(row.concepto || row.concepto_nombre || 'Sin concepto'),
  ciclo_escolar: normalizeCicloKey(row.ciclo_escolar || row.ciclo || ''),
  costo: row.costo ?? null,
  montoFinal: row.montoFinal ?? row.monto_final ?? null,
  meses: row.meses ?? null,
  plazo: row.plazo ?? null,
  eventual: row.eventual ?? null,
  image_url: normalizeText(row.image_url || row.imagen_url || row.imagen || row.foto_url || '', 1000) || null
})

const normalizeCycleRows = (rows: CycleRow[] = []) => {
  const byCycle = new Map<string, { cycle_name: string; is_current: number }>()

  for (const row of rows) {
    const cycle = normalizeCicloKey(row.cycle_name)
    if (!cycle) continue
    const existing = byCycle.get(cycle)
    const isCurrent = Number(row.is_current || 0) ? 1 : 0
    byCycle.set(cycle, {
      cycle_name: cycle,
      is_current: Math.max(existing?.is_current || 0, isCurrent)
    })
  }

  return Array.from(byCycle.values()).sort((a, b) => String(b.cycle_name).localeCompare(String(a.cycle_name), 'es'))
}

const optionalCentralColumn = (columns: Set<string>, column: string, fallbackSql: string, alias = column) =>
  columns.has(column) ? `\`${column}\`` : `${fallbackSql} AS ${alias}`

const imageColumnFor = (columns: Set<string>) => ['image_url', 'imagen_url', 'imagen', 'foto_url'].find((column) => columns.has(column)) || ''

const centralTableExists = async (tableName: string) => {
  try {
    const rows = await controlEscolarCentralQuery<any[]>(`SHOW TABLES LIKE ?`, [tableName])
    return rows.length > 0
  } catch {
    return false
  }
}

export const readCentralConceptMediaForIds = async (conceptoIds: number[] = []) => {
  const ids = Array.from(new Set(conceptoIds.map((id) => Number(id || 0)).filter((id) => id > 0)))
  const media = new Map<number, string>()
  if (!ids.length || !(await centralTableExists('concepto_media'))) return media

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT concepto_id, image_url
      FROM concepto_media
     WHERE IFNULL(activo, 1) = 1
       AND concepto_id IN (${ids.map(() => '?').join(',')})
  `, ids)
  rows.forEach((row) => {
    const id = Number(row?.concepto_id || 0)
    const imageUrl = normalizeText(row?.image_url || '', 1000)
    if (id > 0 && imageUrl) media.set(id, imageUrl)
  })
  return media
}

const mergeConceptMedia = async (rows: ConceptRow[]) => {
  const media = await readCentralConceptMediaForIds(rows.map((row) => Number(row.id || 0)))
  return rows.map((row) => ({
    ...row,
    image_url: normalizeText(row.image_url || media.get(Number(row.id || 0)) || '', 1000) || null
  }))
}

const requireConceptImageStorage = async () => {
  if (!(await centralTableExists('concepto_media'))) {
    throw createError({
      statusCode: 503,
      message: 'Falta la tabla concepto_media en la base externa para guardar imagenes de conceptos.'
    })
  }
}

export const updateCentralConceptImage = async (conceptoId: unknown, imageUrlInput: unknown, user: AuthSessionUser) => {
  const id = Number(conceptoId || 0)
  const imageUrl = normalizeText(imageUrlInput, 1000)
  if (id <= 0) throw createError({ statusCode: 400, message: 'Concepto inválido.' })

  const columns = await getCentralTableColumns('conceptos')
  const imageColumn = imageColumnFor(columns)
  if (imageColumn) {
    await controlEscolarCentralQuery(`UPDATE conceptos SET \`${imageColumn}\` = ? WHERE id = ?`, [imageUrl || null, id])
  } else {
    await requireConceptImageStorage()
    await controlEscolarCentralQuery(`
      INSERT INTO concepto_media (concepto_id, image_url, activo, updated_by)
      VALUES (?, ?, 1, ?)
      ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), activo = 1, updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP
    `, [id, imageUrl || null, user.email || null])
  }
  return { ok: true, concepto_id: id, image_url: imageUrl || null }
}

export const createCentralConcepto = async (input: any, user: AuthSessionUser) => {
  const nombre = normalizeText(input?.concepto || input?.nombre || '', 255)
  const costo = Number(input?.costo ?? input?.monto ?? 0)
  const ciclo = normalizeCicloKey(input?.ciclo || input?.ciclo_escolar || '')
  const description = normalizeText(input?.description || input?.descripcion || '', 255)
  const plantel = normalizePlantel(input?.plantel || 'global') || 'global'
  const imageUrl = normalizeText(input?.image_url || input?.imagen_url || input?.imagen || '', 1000)

  if (!nombre) throw createError({ statusCode: 400, message: 'Escribe el nombre del concepto.' })
  if (!Number.isFinite(costo) || costo < 0) throw createError({ statusCode: 400, message: 'Costo inválido.' })
  if (!ciclo) throw createError({ statusCode: 400, message: 'Selecciona un ciclo.' })

  const columns = await getCentralTableColumns('conceptos')
  if (!columns.has('concepto')) throw createError({ statusCode: 503, message: 'La tabla conceptos externa no tiene la columna concepto.' })

  const fields: string[] = ['concepto']
  const values: any[] = [nombre]
  const add = (column: string, value: any) => {
    if (columns.has(column)) {
      fields.push(column)
      values.push(value)
    }
  }

  add('costo', Math.round(costo))
  add('description', description || null)
  add('plantel', plantel)
  if (columns.has('ciclo')) add('ciclo', ciclo)
  else add('ciclo_escolar', ciclo)
  add('eventual', input?.eventual === undefined ? 1 : (Number(input.eventual) ? 1 : 0))
  add('plazo', normalizeText(input?.plazo || '[1]', 255) || '[1]')
  add('meses', input?.meses ?? null)

  const imageColumn = imageColumnFor(columns)
  if (imageUrl && !imageColumn) await requireConceptImageStorage()
  if (imageUrl && imageColumn) add(imageColumn, imageUrl)

  const result = await controlEscolarCentralQuery<any>(`
    INSERT INTO conceptos (${fields.map((field) => `\`${field}\``).join(', ')})
    VALUES (${fields.map(() => '?').join(', ')})
  `, values)

  const newId = Number(result?.insertId || input?.id || 0)
  if (imageUrl && !imageColumn && newId > 0) {
    await updateCentralConceptImage(newId, imageUrl, user)
  }

  const rows = newId > 0
    ? await controlEscolarCentralQuery<any[]>(`SELECT * FROM conceptos WHERE id = ? LIMIT 1`, [newId])
    : await controlEscolarCentralQuery<any[]>(`SELECT * FROM conceptos WHERE concepto = ? ORDER BY id DESC LIMIT 1`, [nombre])
  const normalized = await mergeConceptMedia(rows.map(normalizeConceptRow))
  return { ok: true, concepto: normalized[0] || { id: newId, concepto: nombre, costo, ciclo_escolar: ciclo, image_url: imageUrl || null } }
}

export const readCentralConceptosConfig = async () => {
  const cycleColumns = await getCentralTableColumns('config_school_cycles')
  const cycleSyncSelect = cycleColumns.has('is_current') ? 'is_current' : '0 AS is_current'
  const cycles = await controlEscolarCentralQuery<CycleRow[]>(
    `SELECT cycle_name, ${cycleSyncSelect} FROM config_school_cycles ORDER BY cycle_name DESC`
  )

  const mappingColumns = await getCentralTableColumns('config_enrollment_mappings')
  const selectParts = [
    'id',
    'cycle_name',
    'plantel',
    'concepto_id',
    'concepto_nombre',
    mappingColumns.has('enrollment_type') ? `IFNULL(enrollment_type, 'regular') AS enrollment_type` : `'regular' AS enrollment_type`,
    mappingColumns.has('months_json') ? `IFNULL(months_json, '[]') AS months_json` : `'[]' AS months_json`,
    optionalCentralColumn(mappingColumns, 'servicio_clave', 'NULL'),
    optionalCentralColumn(mappingColumns, 'servicio_nombre', 'NULL'),
    mappingColumns.has('activo') ? `IFNULL(activo, 1) AS activo` : '1 AS activo',
    mappingColumns.has('sync_version') ? `IFNULL(sync_version, 1) AS sync_version` : '1 AS sync_version',
    optionalCentralColumn(mappingColumns, 'updated_at', 'NULL'),
    optionalCentralColumn(mappingColumns, 'updated_by', 'NULL')
  ]

  const mappings = await controlEscolarCentralQuery<any[]>(
    `SELECT ${selectParts.join(', ')}
       FROM config_enrollment_mappings
      ORDER BY cycle_name DESC, plantel ASC, enrollment_type ASC, concepto_nombre ASC`
  )

  return {
    source: 'central',
    cycles: normalizeCycleRows(cycles),
    mappings: mappings.map(normalizeMappingRow)
  }
}

export const readCentralConceptos = async () => {
  const columns = await getCentralTableColumns('conceptos')
  const imageColumn = imageColumnFor(columns)
  const selectParts = [
    'id',
    'concepto',
    columns.has('ciclo') ? 'CAST(ciclo AS CHAR) AS ciclo_escolar' : `'' AS ciclo_escolar`,
    optionalCentralColumn(columns, 'costo', 'NULL'),
    optionalCentralColumn(columns, 'montoFinal', 'NULL'),
    optionalCentralColumn(columns, 'meses', 'NULL'),
    optionalCentralColumn(columns, 'plazo', 'NULL'),
    optionalCentralColumn(columns, 'eventual', 'NULL'),
    imageColumn ? `\`${imageColumn}\` AS image_url` : 'NULL AS image_url'
  ]
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${selectParts.join(', ')}
       FROM conceptos
      WHERE concepto IS NOT NULL AND TRIM(concepto) <> ''
      ORDER BY concepto ASC`
  )
  return await mergeConceptMedia(rows.map(normalizeConceptRow))
}

const getLocalTableColumns = async (tableName: string) => {
  try {
    const rows = await query<Array<{ Field: string }>>(`SHOW COLUMNS FROM ${'`'}${tableName.replace(/`/g, '``')}${'`'}`)
    return new Set(rows.map((row) => row.Field))
  } catch {
    return new Set<string>()
  }
}

const optionalLocalColumn = (columns: Set<string>, column: string, fallbackSql: string, alias = column) =>
  columns.has(column) ? `\`${column}\`` : `${fallbackSql} AS ${alias}`

export const readLocalConceptosConfig = async () => {
  const cycles = await query<CycleRow[]>(
    `SELECT cycle_name, is_current FROM config_school_cycles ORDER BY cycle_name DESC`
  )
  const mappingColumns = await getLocalTableColumns('config_enrollment_mappings')
  const mappings = await query<any[]>(
    `SELECT id, cycle_name, plantel, concepto_id, concepto_nombre,
            IFNULL(enrollment_type, 'regular') AS enrollment_type,
            IFNULL(months_json, '[]') AS months_json,
            servicio_clave, servicio_nombre,
            IFNULL(activo, 1) AS activo,
            IFNULL(sync_version, 1) AS sync_version,
            updated_at, updated_by
       FROM config_enrollment_mappings
      WHERE IFNULL(activo, 1) = 1
      ORDER BY cycle_name DESC, plantel ASC, enrollment_type ASC, concepto_nombre ASC`
  )
  return {
    source: 'bridge',
    cycles: normalizeCycleRows(cycles),
    mappings: mappings.map(normalizeMappingRow)
  }
}

const legacyItem = (row: ConceptosConfigRow) => {
  const item: Record<string, any> = {
    id: row.id,
    concepto_id: row.concepto_id,
    concepto_nombre: row.concepto_nombre
  }
  if (row.enrollment_type === 'mensual_baja4') item.meses = parseMonths(row.months_json)
  if (row.enrollment_type === 'talleres_servicios') {
    item.servicio = row.servicio_nombre || ''
    item.servicio_clave = row.servicio_clave || ''
  }
  return item
}

export const buildConceptosConfigPayload = (input: { source?: string; cycles: any[]; mappings: ConceptosConfigRow[]; conceptos?: ConceptRow[] }) => {
  const response: any = {
    _api_docs: {
      host: 'nuxt-local',
      description: 'Configuración centralizada de conceptos extendida desde Nuxt.',
      retrocompatibilidad: "El nodo 'planteles' mantiene SOLO inscripciones normales.",
      nodos_extendidos: {
        serviciosGlobales: 'Arreglo de servicios por ciclo escolar.',
        planteles_mensual_baja4: 'Diccionario por plantel con conceptos ligados a meses específicos.',
        planteles_issste: 'Diccionario por plantel con convenios ISSSTE.',
        planteles_curso_verano: 'Diccionario por plantel con conceptos de curso de verano.',
        planteles_talleres_servicios: 'Diccionario por plantel con conceptos mapeados a talleres/servicios.'
      }
    },
    source: input.source || 'bridge',
    cicloActual: null,
    categorias: CONCEPTO_CATEGORIES,
    ciclos: {},
    conceptos: input.conceptos || [],
    talleres: collectServiceCatalog(input.mappings),
    talleresSinConcepto: collectUnassociatedServices(input.mappings),
    conceptosSinCategoria: []
  }

  for (const cycle of input.cycles || []) {
    const cycleName = normalizeCicloKey(cycle.cycle_name || cycle.cycleName || cycle)
    if (!cycleName) continue
    if (Number(cycle.is_current || 0) === 1) response.cicloActual = cycleName
    response.ciclos[cycleName] = {
      esActual: Number(cycle.is_current || 0) === 1,
      serviciosGlobales: [],
      planteles: {},
      planteles_mensual_baja4: {},
      planteles_issste: {},
      planteles_curso_verano: {},
      planteles_talleres_servicios: {},
      planteles_otro: {}
    }
  }

  const ensureCycle = (cycleName: string) => {
    const normalized = normalizeCicloKey(cycleName)
    if (!response.ciclos[normalized]) {
      response.ciclos[normalized] = {
        esActual: false,
        serviciosGlobales: [],
        planteles: {},
        planteles_mensual_baja4: {},
        planteles_issste: {},
        planteles_curso_verano: {},
        planteles_talleres_servicios: {},
        planteles_otro: {}
      }
    }
    return response.ciclos[normalized]
  }

  for (const row of input.mappings || []) {
    if (!isActive(row.activo)) continue
    const cycle = ensureCycle(row.cycle_name)
    const type = normalizeCategory(row.enrollment_type)
    const plantel = normalizePlantel(row.plantel) || 'GLOBAL'
    const item = legacyItem(row)

    if (type === 'servicio_global') {
      cycle.serviciosGlobales.push(item)
      continue
    }

    const targetKey = categoryFor(type).legacyKey
    if (!cycle[targetKey]) cycle[targetKey] = {}
    if (!cycle[targetKey][plantel]) cycle[targetKey][plantel] = []
    cycle[targetKey][plantel].push(item)
  }

  if (!response.cicloActual) {
    response.cicloActual = Object.keys(response.ciclos).sort().reverse()[0] || null
  }

  return response
}

export const collectServiceCatalog = (mappings: ConceptosConfigRow[] = []) => {
  const map = new Map<string, any>()
  for (const row of mappings) {
    if (normalizeCategory(row.enrollment_type) !== 'talleres_servicios') continue
    const name = normalizeText(row.servicio_nombre || '')
    if (!name) continue
    const key = normalizeText(row.servicio_clave || normalizeServiceKey(name), 120)
    if (!map.has(key)) {
      map.set(key, {
        clave: key,
        nombre: name,
        activo: isActive(row.activo),
        conceptos: []
      })
    }
    if (Number(row.concepto_id || 0) > 0) {
      map.get(key).conceptos.push({ id: row.id, concepto_id: row.concepto_id, concepto_nombre: row.concepto_nombre, ciclo: row.cycle_name, plantel: row.plantel })
    }
  }
  return Array.from(map.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
}

export const collectUnassociatedServices = (mappings: ConceptosConfigRow[] = []) => collectServiceCatalog(mappings)
  .filter((service) => !Array.isArray(service.conceptos) || service.conceptos.length === 0)

export const readBestConceptosConfig = async () => {
  let local: Awaited<ReturnType<typeof readLocalConceptosConfig>> | null = null

  try {
    local = await readLocalConceptosConfig()
    if (local.mappings.length) return local
  } catch (e) {}

  try {
    const central = await readCentralConceptosConfig()
    try { await syncCentralConceptosConfigToBridge(central) } catch (e) {}
    return central
  } catch (error) {
    if (local && (local.mappings.length || local.cycles.length)) return local
    throw error
  }
}

export const readBestConceptosConfigPayload = async () => {
  const config = await readBestConceptosConfig()
  let conceptos: ConceptRow[] = []
  try { conceptos = await readCentralConceptos() } catch (e) {}
  return buildConceptosConfigPayload({ ...config, conceptos })
}

export const syncCentralConceptosConfigToBridge = async (preloaded?: Awaited<ReturnType<typeof readCentralConceptosConfig>>) => {
  const central = preloaded || await readCentralConceptosConfig()
  const statements: SqlStatement[] = [
    { sql: 'DELETE FROM config_school_cycles' },
    { sql: 'DELETE FROM config_enrollment_mappings' }
  ]

  for (const cycle of central.cycles) {
    statements.push({
      sql: `INSERT INTO config_school_cycles (cycle_name, is_current) VALUES (?, ?)`,
      params: [cycle.cycle_name, Number(cycle.is_current || 0)]
    })
  }

  for (const row of central.mappings) {
    statements.push({
      sql: `INSERT INTO config_enrollment_mappings
        (id, cycle_name, plantel, concepto_id, concepto_nombre, enrollment_type, months_json,
         servicio_clave, servicio_nombre, activo, sync_version, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        row.id,
        row.cycle_name,
        row.plantel,
        row.concepto_id,
        row.concepto_nombre,
        row.enrollment_type,
        row.months_json || '[]',
        row.servicio_clave || null,
        row.servicio_nombre || null,
        isActive(row.activo) ? 1 : 0,
        Number(row.sync_version || 1),
        row.updated_by || null
      ]
    })
  }

  await executeStatementTransaction(statements)
  return { ok: true, cycles: central.cycles.length, mappings: central.mappings.length }
}

const getSyncErrorMessage = (error: any) => String(
  error?.data?.message ||
  error?.statusMessage ||
  error?.message ||
  'No se pudo sincronizar el espejo Bridge.'
).trim()

export const syncCentralConceptosConfigToBridgeBestEffort = async () => {
  try {
    return await syncCentralConceptosConfigToBridge()
  } catch (error: any) {
    const message = getSyncErrorMessage(error)
    console.warn('[Conceptos Config] Central write completed; Bridge mirror sync skipped:', message)
    return {
      ok: false,
      skipped: true,
      source: 'central',
      reason: 'bridge_sync_unavailable',
      message
    }
  }
}

export const runSyncForActiveBridge = async () => await syncCentralConceptosConfigToBridge()

export const createOrUpdateMapping = async (input: any, user: AuthSessionUser) => {
  const ciclo = normalizeCicloKey(input.ciclo || input.cycle_name)
  const plantel = normalizePlantel(input.plantel)
  const type = normalizeCategory(input.tipo || input.enrollment_type)
  const conceptoId = Number(input.concepto_id || 0)
  const servicioNombre = normalizeText(input.servicio_nombre || input.servicio || '', 160)
  const conceptoNombre = normalizeText(input.concepto_nombre || input.concepto || servicioNombre || 'Sin concepto')

  if (!ciclo || !plantel || !type) throw createError({ statusCode: 400, message: 'Faltan ciclo, plantel o categoría.' })
  if (conceptoId <= 0) throw createError({ statusCode: 400, message: 'Selecciona un concepto financiero.' })

  const serviceKey = normalizeText(input.servicio_clave || normalizeServiceKey(servicioNombre), 120) || null
  const monthsJson = stringifyMonths(input.meses || input.months_json)
  const syncVersion = Date.now()

  const exists = conceptoId > 0
    ? await controlEscolarCentralQuery<any[]>(
      `SELECT id FROM config_enrollment_mappings
        WHERE cycle_name = ? AND plantel = ? AND concepto_id = ? AND IFNULL(enrollment_type, 'regular') = ?
        LIMIT 1`,
      [ciclo, plantel, conceptoId, type]
    )
    : await controlEscolarCentralQuery<any[]>(
      `SELECT id FROM config_enrollment_mappings
        WHERE cycle_name = ? AND plantel = ? AND IFNULL(enrollment_type, 'regular') = ? AND IFNULL(servicio_clave, '') = ?
        LIMIT 1`,
      [ciclo, plantel, type, serviceKey || '']
    )

  if (exists.length) {
    await controlEscolarCentralQuery(
      `UPDATE config_enrollment_mappings
          SET concepto_nombre = ?, months_json = ?, servicio_clave = ?, servicio_nombre = ?, activo = 1, sync_version = ?, updated_by = ?
        WHERE id = ?`,
      [conceptoNombre, monthsJson, serviceKey, servicioNombre || null, syncVersion, user.email, exists[0].id]
    )
  } else {
    await controlEscolarCentralQuery(
      `INSERT INTO config_enrollment_mappings
        (cycle_name, plantel, concepto_id, concepto_nombre, enrollment_type, months_json,
         servicio_clave, servicio_nombre, activo, sync_version, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [ciclo, plantel, conceptoId, conceptoNombre, type, monthsJson, serviceKey, servicioNombre || null, syncVersion, user.email]
    )
  }

  const synced = await syncCentralConceptosConfigToBridgeBestEffort()
  return { ok: true, synced }
}

export const deleteMapping = async (id: unknown) => {
  const mappingId = Number(id || 0)
  if (!mappingId) throw createError({ statusCode: 400, message: 'Mapeo inválido.' })
  await controlEscolarCentralQuery(`DELETE FROM config_enrollment_mappings WHERE id = ?`, [mappingId])
  const synced = await syncCentralConceptosConfigToBridgeBestEffort()
  return { ok: true, synced }
}

export const saveCycle = async (ciclo: unknown, current = false, user?: AuthSessionUser) => {
  const cycle = normalizeCicloKey(ciclo)
  if (!cycle) throw createError({ statusCode: 400, message: 'Ciclo requerido.' })
  if (current) {
    const db = getControlEscolarCentralDb()
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(`INSERT IGNORE INTO config_school_cycles (cycle_name, is_current, sync_version, updated_by) VALUES (?, 0, ?, ?)`, [cycle, Date.now(), user?.email || null])
      await conn.query(`UPDATE config_school_cycles SET is_current = 0, sync_version = ?, updated_by = ?`, [Date.now(), user?.email || null])
      await conn.query(`UPDATE config_school_cycles SET is_current = 1, sync_version = ?, updated_by = ? WHERE cycle_name = ?`, [Date.now(), user?.email || null, cycle])
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  } else {
    await controlEscolarCentralQuery(
      `INSERT IGNORE INTO config_school_cycles (cycle_name, is_current, sync_version, updated_by) VALUES (?, 0, ?, ?)`,
      [cycle, Date.now(), user?.email || null]
    )
  }
  const synced = await syncCentralConceptosConfigToBridgeBestEffort()
  return { ok: true, ciclo: cycle, synced }
}

export const deleteCycle = async (ciclo: unknown) => {
  const cycle = normalizeCicloKey(ciclo)
  if (!cycle) throw createError({ statusCode: 400, message: 'Ciclo requerido.' })
  await controlEscolarCentralQuery(`DELETE FROM config_school_cycles WHERE cycle_name = ?`, [cycle])
  const synced = await syncCentralConceptosConfigToBridgeBestEffort()
  return { ok: true, ciclo: cycle, synced }
}
