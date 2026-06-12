import { query, executeStatementTransaction, type SqlStatement } from './db'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { formatCicloLabel, normalizeCicloKey } from '../../shared/utils/ciclo'

export const CONCEPTO_CATEGORY_DEFINITIONS = [
  { clave: 'inscripcion', nombre: 'Inscripción', orden: 10 },
  { clave: 'talleres_servicios', nombre: 'Talleres y Servicios', orden: 20 },
  { clave: 'servicio_global', nombre: 'Servicio global', orden: 25 },
  { clave: 'curso_verano', nombre: 'Curso de Verano', orden: 30 },
  { clave: 'mensual_baja4', nombre: 'Mensual baja 4', orden: 40 },
  { clave: 'issste', nombre: 'ISSSTE', orden: 50 },
  { clave: 'otro', nombre: 'Otro', orden: 999 }
]

export const CONCEPTO_CATEGORY_KEYS = new Set(CONCEPTO_CATEGORY_DEFINITIONS.map((item) => item.clave))

export type ConceptosConfigSource = 'central' | 'local'

type DbReader = <T>(sql: string, params?: any[]) => Promise<T>

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizePlantel = (value: unknown) => normalizeText(value).toUpperCase()
const normalizeCycleName = (value: unknown) => {
  const text = normalizeText(value)
  return text ? formatCicloLabel(normalizeCicloKey(text)) : ''
}

const normalizeCategory = (value: unknown) => {
  const key = normalizeText(value || 'inscripcion').toLowerCase()
  return CONCEPTO_CATEGORY_KEYS.has(key) ? key : 'otro'
}
const normalizeBool = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(value ?? '').trim().toLowerCase()) ? 1 : 0

const dbReader = (source: ConceptosConfigSource): DbReader => {
  return source === 'central' ? controlEscolarCentralQuery : query
}

export const categoryDefinitions = () => CONCEPTO_CATEGORY_DEFINITIONS.map((entry) => ({ ...entry }))

export const normalizeMonths = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const raw = normalizeText(value)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : []
  } catch (e) {
    return raw.split(',').map((item) => normalizeText(item)).filter(Boolean)
  }
}

const parseJsonArray = (value: unknown) => normalizeMonths(value)

const quoteSyncVersion = (value: unknown) => {
  const number = Number(value || 1)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 1
}

export const conceptIdFrom = (value: unknown) => {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized
}

export const readConceptosCatalog = async (source: ConceptosConfigSource = 'local', options: { ciclo?: string; q?: string; limit?: number } = {}) => {
  const reader = dbReader(source)
  const ciclo = normalizeText(options.ciclo)
  const search = normalizeText(options.q).toLowerCase()
  const limit = Math.max(1, Math.min(500, Number(options.limit || 200)))
  const params: any[] = []
  const where: string[] = ['activo = 1']

  if (ciclo) {
    where.push('(ciclo IS NULL OR ciclo = ? OR ciclo = ? OR ciclo = ?)')
    params.push('', normalizeCicloKey(ciclo), normalizeCycleName(ciclo))
  }

  if (search) {
    where.push('(LOWER(concepto_nombre) LIKE ? OR CAST(concepto_id AS CHAR) = ?)')
    params.push(`%${search}%`, search)
  }

  params.push(limit)

  const rows = await reader<any[]>(`
    SELECT id, concepto_id, concepto_nombre, costo, monto_final, meses, plazo, eventual, ciclo, activo, sync_version, updated_at
    FROM conceptos_global
    WHERE ${where.join(' AND ')}
    ORDER BY concepto_nombre ASC
    LIMIT ?
  `, params)

  return rows.map((row) => ({
    id: Number(row.id || 0),
    concepto_id: Number(row.concepto_id || 0),
    concepto_nombre: normalizeText(row.concepto_nombre),
    concepto: normalizeText(row.concepto_nombre),
    costo: row.costo,
    monto_final: row.monto_final,
    montoFinal: row.monto_final,
    meses: row.meses,
    plazo: row.plazo,
    eventual: Number(row.eventual || 0),
    ciclo: normalizeText(row.ciclo),
    activo: Number(row.activo ?? 1),
    sync_version: quoteSyncVersion(row.sync_version),
    updated_at: row.updated_at
  }))
}

export const readServiciosCatalog = async (source: ConceptosConfigSource = 'local', options: { q?: string; includeInactive?: boolean } = {}) => {
  const reader = dbReader(source)
  const search = normalizeText(options.q).toLowerCase()
  const params: any[] = []
  const where: string[] = []

  if (!options.includeInactive) where.push('activo = 1')
  if (search) {
    where.push('(LOWER(nombre) LIKE ? OR LOWER(clave) LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  const rows = await reader<any[]>(`
    SELECT id, clave, nombre, tipo, icono, color, orden, activo, sync_version, updated_at
    FROM servicios_catalogo
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY activo DESC, orden ASC, nombre ASC
  `, params)

  return rows.map((row) => ({
    id: Number(row.id || 0),
    clave: normalizeText(row.clave),
    nombre: normalizeText(row.nombre),
    tipo: normalizeText(row.tipo) || 'servicio',
    icono: normalizeText(row.icono),
    color: normalizeText(row.color),
    orden: Number(row.orden || 0),
    activo: Number(row.activo ?? 1),
    sync_version: quoteSyncVersion(row.sync_version),
    updated_at: row.updated_at
  }))
}

export const readConceptConfigRows = async (source: ConceptosConfigSource = 'local', options: { ciclo?: string; plantel?: string; categoria?: string; includeInactive?: boolean } = {}) => {
  const reader = dbReader(source)
  const params: any[] = []
  const where: string[] = []
  const ciclo = normalizeText(options.ciclo)
  const plantel = normalizePlantel(options.plantel)
  const categoria = normalizeText(options.categoria).toLowerCase()

  if (ciclo) {
    where.push('(cfg.ciclo = ? OR cfg.ciclo = ?)')
    params.push(normalizeCicloKey(ciclo), normalizeCycleName(ciclo))
  }
  if (plantel && plantel !== 'GLOBAL') {
    where.push('cfg.plantel = ?')
    params.push(plantel)
  }
  if (categoria) {
    where.push('cfg.categoria_clave = ?')
    params.push(normalizeCategory(categoria))
  }
  if (!options.includeInactive) where.push('cfg.activo = 1')

  const rows = await reader<any[]>(`
    SELECT
      cfg.id,
      cfg.concepto_id,
      cfg.concepto_nombre,
      cfg.ciclo,
      cfg.plantel,
      cfg.categoria_clave,
      cfg.months_json,
      cfg.activo,
      cfg.sync_version,
      cfg.updated_at,
      cg.costo,
      cg.monto_final,
      cg.meses,
      cg.plazo,
      cg.eventual,
      scm.id AS mapping_id,
      svc.id AS servicio_id,
      svc.clave AS servicio_clave,
      svc.nombre AS servicio_nombre,
      svc.tipo AS servicio_tipo,
      svc.icono AS servicio_icono,
      svc.color AS servicio_color
    FROM concepto_config cfg
    LEFT JOIN conceptos_global cg ON cg.concepto_id = cfg.concepto_id
    LEFT JOIN concepto_servicio_map scm ON scm.concepto_config_id = cfg.id AND scm.activo = 1
    LEFT JOIN servicios_catalogo svc ON svc.id = scm.servicio_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY cfg.ciclo DESC, cfg.plantel ASC, cfg.categoria_clave ASC, cfg.concepto_nombre ASC
  `, params)

  return rows.map((row) => ({
    id: Number(row.id || 0),
    concepto_id: Number(row.concepto_id || 0),
    concepto_nombre: normalizeText(row.concepto_nombre),
    ciclo: normalizeText(row.ciclo),
    plantel: normalizePlantel(row.plantel),
    categoria_clave: normalizeCategory(row.categoria_clave),
    months: parseJsonArray(row.months_json),
    months_json: normalizeText(row.months_json || '[]'),
    activo: Number(row.activo ?? 1),
    sync_version: quoteSyncVersion(row.sync_version),
    updated_at: row.updated_at,
    costo: row.costo,
    monto_final: row.monto_final,
    meses: row.meses,
    plazo: row.plazo,
    eventual: Number(row.eventual || 0),
    mapping_id: row.mapping_id ? Number(row.mapping_id) : null,
    servicio: row.servicio_id ? {
      id: Number(row.servicio_id),
      clave: normalizeText(row.servicio_clave),
      nombre: normalizeText(row.servicio_nombre),
      tipo: normalizeText(row.servicio_tipo) || 'servicio',
      icono: normalizeText(row.servicio_icono),
      color: normalizeText(row.servicio_color)
    } : null
  }))
}

const mappedItemFromConfig = (row: any) => {
  const item: any = {
    id: row.id,
    concepto_id: row.concepto_id,
    concepto_nombre: row.concepto_nombre
  }
  if (row.months?.length) item.meses = row.months
  if (row.servicio) item.servicio = row.servicio
  return item
}

export const buildConceptConfigResponse = async (source: ConceptosConfigSource = 'local') => {
  const reader = dbReader(source)
  const cycleRows = await reader<any[]>(`
    SELECT cycle_name, is_current
    FROM config_school_cycles
    ORDER BY cycle_name DESC
  `)

  const cycles = cycleRows.length
    ? cycleRows
    : [{ cycle_name: normalizeCicloKey(new Date().getFullYear()), is_current: 1 }]

  const response: any = {
    _api_docs: {
      host: 'nuxt-local',
      description: 'Configuración centralizada de conceptos por ciclo, plantel y categoría.',
      retrocompatibilidad: "El nodo 'planteles' mantiene SOLO inscripciones normales.",
      nodos_extendidos: {
        serviciosGlobales: 'Arreglo de servicios globales por ciclo escolar.',
        planteles_mensual_baja4: 'Diccionario por plantel con conceptos ligados a meses específicos.',
        planteles_issste: 'Diccionario por plantel con convenios ISSSTE.',
        planteles_curso_verano: 'Diccionario por plantel con conceptos de curso de verano.',
        planteles_talleres_servicios: 'Diccionario por plantel con conceptos mapeados a talleres/servicios.'
      }
    },
    cicloActual: null,
    ciclos: {},
    categorias: categoryDefinitions(),
    serviciosCatalogo: await readServiciosCatalog(source),
    source
  }

  for (const cycle of cycles) {
    const ciclo = normalizeText(cycle.cycle_name)
    if (Number(cycle.is_current || 0) === 1) response.cicloActual = ciclo
    response.ciclos[ciclo] = {
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

  const mappings = await readConceptConfigRows(source, { includeInactive: false })

  for (const mapping of mappings) {
    if (!response.ciclos[mapping.ciclo]) {
      response.ciclos[mapping.ciclo] = {
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

    const cycle = response.ciclos[mapping.ciclo]
    const item = mappedItemFromConfig(mapping)
    const plantel = mapping.plantel

    if (mapping.categoria_clave === 'servicio_global') {
      cycle.serviciosGlobales.push(item)
      continue
    }

    const bucketName = mapping.categoria_clave === 'inscripcion'
      ? 'planteles'
      : mapping.categoria_clave === 'mensual_baja4'
        ? 'planteles_mensual_baja4'
        : mapping.categoria_clave === 'issste'
          ? 'planteles_issste'
          : mapping.categoria_clave === 'curso_verano'
            ? 'planteles_curso_verano'
            : mapping.categoria_clave === 'talleres_servicios'
              ? 'planteles_talleres_servicios'
              : 'planteles_otro'

    if (!cycle[bucketName][plantel]) cycle[bucketName][plantel] = []
    cycle[bucketName][plantel].push(item)
  }

  if (!response.cicloActual) {
    const firstCycle = Object.keys(response.ciclos)[0]
    response.cicloActual = firstCycle || null
    if (firstCycle) response.ciclos[firstCycle].esActual = true
  }

  return response
}

export const createService = async (payload: any, userEmail: string) => {
  const nombre = normalizeText(payload.nombre)
  if (!nombre) throw createError({ statusCode: 400, message: 'Nombre requerido.' })
  const clave = normalizeText(payload.clave || nombre)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `servicio_${Date.now()}`

  await controlEscolarCentralQuery<any>(`
    INSERT INTO servicios_catalogo (clave, nombre, tipo, icono, color, orden, activo, updated_by, sync_version)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, UNIX_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      nombre = VALUES(nombre),
      tipo = VALUES(tipo),
      icono = VALUES(icono),
      color = VALUES(color),
      orden = VALUES(orden),
      activo = 1,
      updated_by = VALUES(updated_by),
      sync_version = UNIX_TIMESTAMP(),
      updated_at = CURRENT_TIMESTAMP
  `, [clave, nombre, normalizeText(payload.tipo || 'servicio'), normalizeText(payload.icono), normalizeText(payload.color), Number(payload.orden || 0), userEmail])

  const [service] = await controlEscolarCentralQuery<any[]>(`SELECT * FROM servicios_catalogo WHERE clave = ? LIMIT 1`, [clave])
  return service
}

export const importLocalConceptosToCentral = async (userEmail: string, options: { ciclo?: string; plantel?: string } = {}) => {
  const ciclo = normalizeText(options.ciclo)
  const params: any[] = []
  const where: string[] = []
  if (ciclo) {
    where.push('(ciclo = ? OR ciclo = ?)')
    params.push(normalizeCicloKey(ciclo), normalizeCycleName(ciclo))
  }

  const rows = await query<any[]>(`
    SELECT id, concepto, costo, plazo, eventual, ciclo
    FROM conceptos
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY concepto ASC
  `, params)

  for (const row of rows) {
    await controlEscolarCentralQuery<any>(`
      INSERT INTO conceptos_global (concepto_id, concepto_nombre, costo, monto_final, meses, plazo, eventual, ciclo, activo, updated_by, sync_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, UNIX_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        concepto_nombre = VALUES(concepto_nombre),
        costo = VALUES(costo),
        monto_final = VALUES(monto_final),
        meses = VALUES(meses),
        plazo = VALUES(plazo),
        eventual = VALUES(eventual),
        ciclo = VALUES(ciclo),
        activo = 1,
        updated_by = VALUES(updated_by),
        sync_version = UNIX_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP
    `, [
      Number(row.id || 0),
      normalizeText(row.concepto),
      row.costo ?? null,
      row.costo ?? null,
      Number(row.plazo || 1) || null,
      normalizeText(row.plazo),
      normalizeBool(row.eventual),
      normalizeCycleName(row.ciclo || ciclo),
      userEmail
    ])
  }

  await syncCentralConceptConfigToBridge({ ciclo })
  return { imported: rows.length }
}

export const saveConceptMapping = async (payload: any, userEmail: string) => {
  const conceptoId = Number(payload.concepto_id || payload.conceptoId || 0)
  const conceptoNombre = normalizeText(payload.concepto_nombre || payload.conceptoNombre)
  const ciclo = normalizeCycleName(payload.ciclo)
  const plantel = normalizePlantel(payload.plantel)
  const categoria = normalizeCategory(payload.categoria_clave || payload.categoria || payload.tipo)
  const months = normalizeMonths(payload.meses || payload.months || payload.months_json)
  const servicioId = Number(payload.servicio_id || payload.servicioId || 0)

  if (!conceptoId || !conceptoNombre || !ciclo || !plantel) {
    throw createError({ statusCode: 400, message: 'Faltan datos de concepto, ciclo o plantel.' })
  }

  await controlEscolarCentralQuery<any>(`
    INSERT INTO conceptos_global (concepto_id, concepto_nombre, activo, updated_by, sync_version)
    VALUES (?, ?, 1, ?, UNIX_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      concepto_nombre = VALUES(concepto_nombre),
      activo = 1,
      updated_by = VALUES(updated_by),
      sync_version = UNIX_TIMESTAMP(),
      updated_at = CURRENT_TIMESTAMP
  `, [conceptoId, conceptoNombre, userEmail])

  await controlEscolarCentralQuery<any>(`
    INSERT INTO concepto_config (concepto_id, concepto_nombre, ciclo, plantel, categoria_clave, months_json, activo, updated_by, sync_version)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, UNIX_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      concepto_nombre = VALUES(concepto_nombre),
      months_json = VALUES(months_json),
      activo = 1,
      updated_by = VALUES(updated_by),
      sync_version = UNIX_TIMESTAMP(),
      updated_at = CURRENT_TIMESTAMP
  `, [conceptoId, conceptoNombre, ciclo, plantel, categoria, JSON.stringify(months), userEmail])

  const [configRow] = await controlEscolarCentralQuery<any[]>(`
    SELECT id FROM concepto_config
    WHERE concepto_id = ? AND ciclo = ? AND plantel = ? AND categoria_clave = ?
    LIMIT 1
  `, [conceptoId, ciclo, plantel, categoria])

  if (categoria === 'talleres_servicios' && servicioId) {
    await controlEscolarCentralQuery<any>(`
      INSERT INTO concepto_servicio_map (concepto_config_id, servicio_id, activo, updated_by, sync_version)
      VALUES (?, ?, 1, ?, UNIX_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        servicio_id = VALUES(servicio_id),
        activo = 1,
        updated_by = VALUES(updated_by),
        sync_version = UNIX_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP
    `, [Number(configRow.id), servicioId, userEmail])
  } else if (configRow?.id) {
    await controlEscolarCentralQuery<any>(`
      UPDATE concepto_servicio_map
      SET activo = 0, updated_by = ?, sync_version = UNIX_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP
      WHERE concepto_config_id = ?
    `, [userEmail, Number(configRow.id)])
  }

  await syncCentralConceptConfigToBridge({ ciclo, plantel })
  return { success: true, id: Number(configRow?.id || 0) }
}

export const deleteConceptMapping = async (id: number, userEmail: string) => {
  const [existing] = await controlEscolarCentralQuery<any[]>(`SELECT ciclo, plantel FROM concepto_config WHERE id = ? LIMIT 1`, [id])
  if (!existing) throw createError({ statusCode: 404, message: 'Mapeo no encontrado.' })

  await controlEscolarCentralQuery<any>(`
    UPDATE concepto_config
    SET activo = 0, updated_by = ?, sync_version = UNIX_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [userEmail, id])
  await controlEscolarCentralQuery<any>(`
    UPDATE concepto_servicio_map
    SET activo = 0, updated_by = ?, sync_version = UNIX_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP
    WHERE concepto_config_id = ?
  `, [userEmail, id])

  await syncCentralConceptConfigToBridge({ ciclo: existing.ciclo, plantel: existing.plantel })
  return { success: true }
}

export const saveCycle = async (ciclo: string, userEmail: string) => {
  const cycle = normalizeCycleName(ciclo)
  if (!cycle) throw createError({ statusCode: 400, message: 'Ciclo requerido.' })
  await controlEscolarCentralQuery<any>(`
    INSERT INTO config_school_cycles (cycle_name, is_current, updated_by, sync_version)
    VALUES (?, 0, ?, UNIX_TIMESTAMP())
    ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by), sync_version = UNIX_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP
  `, [cycle, userEmail])
  await syncCentralConceptConfigToBridge({ ciclo: cycle })
  return { success: true, ciclo: cycle }
}

export const setCurrentCycle = async (ciclo: string, userEmail: string) => {
  const cycle = normalizeCycleName(ciclo)
  if (!cycle) throw createError({ statusCode: 400, message: 'Ciclo requerido.' })
  await controlEscolarCentralQuery<any>(`INSERT IGNORE INTO config_school_cycles (cycle_name, is_current, updated_by, sync_version) VALUES (?, 0, ?, UNIX_TIMESTAMP())`, [cycle, userEmail])
  await controlEscolarCentralQuery<any>(`UPDATE config_school_cycles SET is_current = 0, updated_by = ?, sync_version = UNIX_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP`, [userEmail])
  await controlEscolarCentralQuery<any>(`UPDATE config_school_cycles SET is_current = 1, updated_by = ?, sync_version = UNIX_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP WHERE cycle_name = ?`, [userEmail, cycle])
  await syncCentralConceptConfigToBridge({})
  return { success: true, cicloActual: cycle }
}

export const syncCentralConceptConfigToBridge = async (options: { ciclo?: string; plantel?: string } = {}) => {
  const ciclos = await controlEscolarCentralQuery<any[]>(`SELECT cycle_name, is_current, sync_version FROM config_school_cycles`)
  const categorias = await controlEscolarCentralQuery<any[]>(`SELECT clave, nombre, orden, activo, sync_version FROM concepto_categorias`)
  const conceptos = await controlEscolarCentralQuery<any[]>(`SELECT * FROM conceptos_global`)
  const servicios = await controlEscolarCentralQuery<any[]>(`SELECT * FROM servicios_catalogo`)
  const configs = await controlEscolarCentralQuery<any[]>(`SELECT * FROM concepto_config`)
  const maps = await controlEscolarCentralQuery<any[]>(`SELECT * FROM concepto_servicio_map`)

  const statements: SqlStatement[] = []

  for (const category of CONCEPTO_CATEGORY_DEFINITIONS) {
    statements.push({
      sql: `INSERT INTO concepto_categorias (clave, nombre, orden, activo, sync_version) VALUES (?, ?, ?, 1, 1)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), orden = VALUES(orden), activo = 1`,
      params: [category.clave, category.nombre, category.orden]
    })
  }

  for (const row of ciclos) {
    statements.push({
      sql: `INSERT INTO config_school_cycles (cycle_name, is_current, sync_version) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE is_current = VALUES(is_current), sync_version = VALUES(sync_version), updated_at = CURRENT_TIMESTAMP`,
      params: [row.cycle_name, Number(row.is_current || 0), quoteSyncVersion(row.sync_version)]
    })
  }

  for (const row of categorias) {
    statements.push({
      sql: `INSERT INTO concepto_categorias (clave, nombre, orden, activo, sync_version) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), orden = VALUES(orden), activo = VALUES(activo), sync_version = VALUES(sync_version), updated_at = CURRENT_TIMESTAMP`,
      params: [row.clave, row.nombre, Number(row.orden || 0), Number(row.activo ?? 1), quoteSyncVersion(row.sync_version)]
    })
  }

  for (const row of conceptos) {
    statements.push({
      sql: `INSERT INTO conceptos_global (id, concepto_id, concepto_nombre, costo, monto_final, meses, plazo, eventual, ciclo, activo, sync_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE concepto_id = VALUES(concepto_id), concepto_nombre = VALUES(concepto_nombre), costo = VALUES(costo), monto_final = VALUES(monto_final), meses = VALUES(meses), plazo = VALUES(plazo), eventual = VALUES(eventual), ciclo = VALUES(ciclo), activo = VALUES(activo), sync_version = VALUES(sync_version), updated_at = CURRENT_TIMESTAMP`,
      params: [row.id, row.concepto_id, row.concepto_nombre, row.costo, row.monto_final, row.meses, row.plazo, Number(row.eventual || 0), row.ciclo || '', Number(row.activo ?? 1), quoteSyncVersion(row.sync_version)]
    })
  }

  for (const row of servicios) {
    statements.push({
      sql: `INSERT INTO servicios_catalogo (id, clave, nombre, tipo, icono, color, orden, activo, sync_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE clave = VALUES(clave), nombre = VALUES(nombre), tipo = VALUES(tipo), icono = VALUES(icono), color = VALUES(color), orden = VALUES(orden), activo = VALUES(activo), sync_version = VALUES(sync_version), updated_at = CURRENT_TIMESTAMP`,
      params: [row.id, row.clave, row.nombre, row.tipo || 'servicio', row.icono || '', row.color || '', Number(row.orden || 0), Number(row.activo ?? 1), quoteSyncVersion(row.sync_version)]
    })
  }

  for (const row of configs) {
    statements.push({
      sql: `INSERT INTO concepto_config (id, concepto_id, concepto_nombre, ciclo, plantel, categoria_clave, months_json, activo, sync_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE concepto_id = VALUES(concepto_id), concepto_nombre = VALUES(concepto_nombre), ciclo = VALUES(ciclo), plantel = VALUES(plantel), categoria_clave = VALUES(categoria_clave), months_json = VALUES(months_json), activo = VALUES(activo), sync_version = VALUES(sync_version), updated_at = CURRENT_TIMESTAMP`,
      params: [row.id, row.concepto_id, row.concepto_nombre, row.ciclo, row.plantel, row.categoria_clave, row.months_json || '[]', Number(row.activo ?? 1), quoteSyncVersion(row.sync_version)]
    })
  }

  for (const row of maps) {
    statements.push({
      sql: `INSERT INTO concepto_servicio_map (id, concepto_config_id, servicio_id, activo, sync_version)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE concepto_config_id = VALUES(concepto_config_id), servicio_id = VALUES(servicio_id), activo = VALUES(activo), sync_version = VALUES(sync_version), updated_at = CURRENT_TIMESTAMP`,
      params: [row.id, row.concepto_config_id, row.servicio_id, Number(row.activo ?? 1), quoteSyncVersion(row.sync_version)]
    })
  }

  await executeStatementTransaction(statements)
  const scopeKey = [normalizeText(options.ciclo) || 'ALL', normalizePlantel(options.plantel) || 'ALL'].join(':')
  await query(`INSERT INTO conceptos_sync_state (scope_key, last_sync_version, last_synced_at) VALUES (?, UNIX_TIMESTAMP(), CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_sync_version = VALUES(last_sync_version), last_synced_at = VALUES(last_synced_at), updated_at = CURRENT_TIMESTAMP`, [scopeKey])

  return { success: true, synced: { ciclos: ciclos.length, conceptos: conceptos.length, configs: configs.length, servicios: servicios.length, maps: maps.length } }
}

export const readAdminDashboard = async (options: { ciclo?: string; plantel?: string; categoria?: string } = {}) => {
  const [conceptos, servicios, mappings, configResponse] = await Promise.all([
    readConceptosCatalog('central', { ciclo: options.ciclo, limit: 500 }),
    readServiciosCatalog('central', { includeInactive: true }),
    readConceptConfigRows('central', { ciclo: options.ciclo, plantel: options.plantel, categoria: options.categoria, includeInactive: true }),
    buildConceptConfigResponse('central')
  ])

  const activeMappings = mappings.filter((row) => row.activo)
  const mappedConceptIds = new Set(activeMappings.map((row) => String(row.concepto_id)))
  const mappedServiceIds = new Set(activeMappings.map((row) => String(row.servicio?.id || '')).filter(Boolean))

  return {
    conceptos,
    servicios,
    mappings,
    categorias: categoryDefinitions(),
    config: configResponse,
    conceptosSinCategoria: conceptos.filter((concepto) => !mappedConceptIds.has(String(concepto.concepto_id))),
    talleresSinConcepto: servicios.filter((servicio) => !mappedServiceIds.has(String(servicio.id))),
    sync: await query<any[]>(`SELECT scope_key, last_sync_version, last_synced_at, updated_at FROM conceptos_sync_state ORDER BY updated_at DESC LIMIT 10`).catch(() => [])
  }
}
