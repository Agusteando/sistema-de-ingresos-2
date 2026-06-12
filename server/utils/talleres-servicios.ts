import { query, executeStatementTransaction, type SqlStatement } from './db'
import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { normalizeCicloKey, formatCicloLabel } from '../../shared/utils/ciclo'
import {
  DEFAULT_TALLERES_SERVICIOS,
  DEFAULT_TALLER_SERVICIO_IMAGE,
  addServicioToCsv,
  normalizeServicioClave,
  normalizeServicioNombre,
  parseServiciosCsv,
  removeServicioFromCsv,
  serializeServiciosCsv,
  serviceSeedByKey,
  serviceSeedByName,
} from '../../shared/utils/talleresServicios'

export type TallerServicioCatalogRow = {
  servicio_clave: string
  servicio_nombre: string
  imagen_url: string
  activo: number | boolean
  orden: number
  sync_version?: number | string | null
  updated_by?: string | null
}

type MatriculaServicioField = 'servicio' | 'servicios'

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const compactText = (value: unknown, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength)
const normalizeMatricula = (value: unknown) => compactText(value, 64).toUpperCase()
const truthy = (value: unknown) => value === undefined || value === null ? true : Number(value) !== 0

const defaultCatalogRows = () => DEFAULT_TALLERES_SERVICIOS.map((item) => ({
  servicio_clave: item.clave,
  servicio_nombre: item.nombre,
  imagen_url: item.imagen,
  activo: 1,
  orden: item.orden,
  sync_version: 1,
  updated_by: null,
}))

const normalizeCatalogRow = (row: any): TallerServicioCatalogRow => {
  const seed = serviceSeedByKey(row?.servicio_clave) || serviceSeedByName(row?.servicio_nombre)
  const clave = normalizeServicioClave(row?.servicio_clave || row?.clave || row?.servicio_nombre || seed?.clave)
  const nombre = normalizeServicioNombre(row?.servicio_nombre || row?.nombre || seed?.nombre || clave)
  return {
    servicio_clave: clave,
    servicio_nombre: nombre,
    imagen_url: compactText(row?.imagen_url || row?.imagen || seed?.imagen || (clave ? `/talleres-servicios/${clave}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE), 255),
    activo: truthy(row?.activo) ? 1 : 0,
    orden: Number(row?.orden || seed?.orden || 9999),
    sync_version: Number(row?.sync_version || 1),
    updated_by: row?.updated_by || null,
  }
}

const sortCatalog = (rows: TallerServicioCatalogRow[]) => [...rows]
  .filter((row) => row.servicio_clave && row.servicio_nombre)
  .sort((a, b) => Number(a.orden || 9999) - Number(b.orden || 9999) || a.servicio_nombre.localeCompare(b.servicio_nombre, 'es'))

const dedupeCatalog = (rows: TallerServicioCatalogRow[]) => {
  const map = new Map<string, TallerServicioCatalogRow>()
  for (const row of rows.map(normalizeCatalogRow)) {
    if (!row.servicio_clave) continue
    const existing = map.get(row.servicio_clave)
    if (!existing || Number(row.orden || 9999) < Number(existing.orden || 9999)) map.set(row.servicio_clave, row)
  }
  return sortCatalog(Array.from(map.values()))
}

const centralCatalogTableExists = async () => {
  const rows = await controlEscolarCentralQuery<any[]>(`SHOW TABLES LIKE 'talleres_servicios_catalogo'`)
  return rows.length > 0
}

export const readCentralTalleresServiciosCatalog = async () => {
  if (!(await centralCatalogTableExists())) return { source: 'seed', catalog: defaultCatalogRows() }
  const columns = await getCentralTableColumns('talleres_servicios_catalogo')
  const select = [
    columns.has('servicio_clave') ? 'servicio_clave' : 'NULL AS servicio_clave',
    columns.has('servicio_nombre') ? 'servicio_nombre' : 'NULL AS servicio_nombre',
    columns.has('imagen_url') ? 'imagen_url' : 'NULL AS imagen_url',
    columns.has('activo') ? 'IFNULL(activo, 1) AS activo' : '1 AS activo',
    columns.has('orden') ? 'IFNULL(orden, 9999) AS orden' : '9999 AS orden',
    columns.has('sync_version') ? 'IFNULL(sync_version, 1) AS sync_version' : '1 AS sync_version',
    columns.has('updated_by') ? 'updated_by' : 'NULL AS updated_by',
  ]
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${select.join(', ')} FROM talleres_servicios_catalogo WHERE ${columns.has('activo') ? 'IFNULL(activo, 1) = 1' : '1=1'} ORDER BY ${columns.has('orden') ? 'orden' : 'servicio_nombre'} ASC, servicio_nombre ASC`
  )
  const catalog = dedupeCatalog([...defaultCatalogRows(), ...rows])
  return { source: 'central', catalog }
}

export const readLocalTalleresServiciosCatalog = async () => {
  try {
    const rows = await query<any[]>(
      `SELECT servicio_clave, servicio_nombre, imagen_url, IFNULL(activo, 1) AS activo, IFNULL(orden, 9999) AS orden, IFNULL(sync_version, 1) AS sync_version, updated_by
         FROM talleres_servicios_catalogo
        WHERE IFNULL(activo, 1) = 1
        ORDER BY orden ASC, servicio_nombre ASC`
    )
    return { source: 'bridge', catalog: dedupeCatalog([...defaultCatalogRows(), ...rows]) }
  } catch (error) {
    return { source: 'seed', catalog: defaultCatalogRows() }
  }
}

export const readBestTalleresServiciosCatalog = async () => {
  try {
    const central = await readCentralTalleresServiciosCatalog()
    if (central.catalog.length) {
      try { await syncCentralTalleresServiciosCatalogToBridge(central.catalog) } catch (e) {}
      return central
    }
  } catch (error) {}

  return await readLocalTalleresServiciosCatalog()
}

export const syncCentralTalleresServiciosCatalogToBridge = async (preloaded?: TallerServicioCatalogRow[]) => {
  const central = preloaded || (await readCentralTalleresServiciosCatalog()).catalog
  const statements: SqlStatement[] = [{ sql: 'DELETE FROM talleres_servicios_catalogo' }]
  for (const row of dedupeCatalog(central)) {
    statements.push({
      sql: `INSERT INTO talleres_servicios_catalogo
        (servicio_clave, servicio_nombre, imagen_url, activo, orden, sync_version, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [row.servicio_clave, row.servicio_nombre, row.imagen_url || DEFAULT_TALLER_SERVICIO_IMAGE, truthy(row.activo) ? 1 : 0, Number(row.orden || 9999), Number(row.sync_version || 1), row.updated_by || null]
    })
  }
  await executeStatementTransaction(statements)
  return { ok: true, catalog: central.length }
}

const resolveMatriculaServicioField = async (): Promise<MatriculaServicioField> => {
  const columns = await getCentralTableColumns('matricula')
  if (columns.has('servicio')) return 'servicio'
  if (columns.has('servicios')) return 'servicios'
  throw createError({ statusCode: 500, message: 'La tabla central matricula no tiene columna servicio.' })
}

export const readCentralMatriculaServicios = async (matricula: unknown) => {
  const key = normalizeMatricula(matricula)
  if (!key) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  const field = await resolveMatriculaServicioField()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${escapeIdentifier(field)} AS servicios FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`,
    [key]
  )
  const raw = rows[0]?.servicios || ''
  return { field, raw: compactText(raw, 5000), servicios: parseServiciosCsv(raw) }
}

export const resolveServiciosWithCatalog = async (servicios: unknown[]) => {
  const { catalog, source } = await readBestTalleresServiciosCatalog()
  const byKey = new Map(catalog.map((item) => [item.servicio_clave, item]))
  const resolved = servicios.map((value) => {
    const nombre = normalizeServicioNombre(value)
    const key = normalizeServicioClave(nombre)
    const catalogItem = byKey.get(key) || serviceSeedByKey(key)
    return {
      clave: key,
      nombre: catalogItem?.servicio_nombre || nombre,
      imagen: catalogItem?.imagen_url || (key ? `/talleres-servicios/${key}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE),
      source: catalogItem ? 'catalog' : 'legacy'
    }
  })
  return { catalog, catalogSource: source, servicios: resolved }
}

export const updateCentralMatriculaServicio = async ({
  matricula,
  action,
  servicio,
  userEmail,
}: {
  matricula: unknown
  action: 'add' | 'remove'
  servicio: unknown
  userEmail?: string | null
}) => {
  const key = normalizeMatricula(matricula)
  const servicioNombre = normalizeServicioNombre(servicio)
  if (!key) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  if (!servicioNombre) throw createError({ statusCode: 400, message: 'Selecciona un taller o servicio.' })

  const current = await readCentralMatriculaServicios(key)
  const next = action === 'remove'
    ? removeServicioFromCsv(current.raw, servicioNombre)
    : addServicioToCsv(current.raw, servicioNombre)

  if (next.changed) {
    const columns = await getCentralTableColumns('matricula')
    const assignments = [`${escapeIdentifier(current.field)} = ?`]
    const params: any[] = [next.value]
    if (columns.has('updated_at')) assignments.push('`updated_at` = CURRENT_TIMESTAMP')
    if (columns.has('updated_by')) {
      assignments.push('`updated_by` = ?')
      params.push(userEmail || 'sistema')
    }
    params.push(key)
    await controlEscolarCentralQuery(
      `UPDATE matricula SET ${assignments.join(', ')} WHERE UPPER(TRIM(matricula)) = ?`,
      params
    )
  }

  return {
    ok: true,
    changed: next.changed,
    field: current.field,
    raw: next.value,
    servicios: next.servicios,
  }
}

export const findTallerServicioForConcept = async ({
  conceptoId,
  ciclo,
  plantel,
}: {
  conceptoId: unknown
  ciclo?: unknown
  plantel?: unknown
}) => {
  const id = Number(conceptoId || 0)
  if (!id) return null
  const cicloKey = normalizeCicloKey(ciclo)
  const cycleCandidates = Array.from(new Set([cicloKey, formatCicloLabel(cicloKey)].filter(Boolean)))
  const plantelKey = compactText(plantel, 40).toUpperCase()
  const plantelCandidates = Array.from(new Set([plantelKey, 'GLOBAL'].filter(Boolean)))
  const cycleWhere = cycleCandidates.length ? `AND cycle_name IN (${cycleCandidates.map(() => '?').join(',')})` : ''
  const plantelWhere = plantelCandidates.length ? `AND UPPER(TRIM(plantel)) IN (${plantelCandidates.map(() => '?').join(',')})` : ''

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT servicio_clave, servicio_nombre
       FROM config_enrollment_mappings
      WHERE concepto_id = ?
        AND IFNULL(activo, 1) = 1
        AND IFNULL(enrollment_type, 'regular') = 'talleres_servicios'
        AND IFNULL(servicio_clave, '') <> ''
        ${cycleWhere}
        ${plantelWhere}
      ORDER BY CASE WHEN UPPER(TRIM(plantel)) = ? THEN 0 ELSE 1 END, id DESC
      LIMIT 1`,
    [id, ...cycleCandidates, ...plantelCandidates, plantelKey]
  )
  const row = rows[0]
  if (!row) return null
  const catalog = await readBestTalleresServiciosCatalog()
  const normalizedKey = normalizeServicioClave(row.servicio_clave || row.servicio_nombre)
  const match = catalog.catalog.find((item) => item.servicio_clave === normalizedKey) || serviceSeedByKey(normalizedKey)
  return {
    clave: normalizedKey,
    nombre: match?.servicio_nombre || normalizeServicioNombre(row.servicio_nombre),
    imagen: match?.imagen_url || (normalizedKey ? `/talleres-servicios/${normalizedKey}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE),
  }
}

export const appendConceptMappedServicioToMatricula = async ({
  matricula,
  conceptoId,
  ciclo,
  plantel,
  userEmail,
}: {
  matricula: unknown
  conceptoId: unknown
  ciclo?: unknown
  plantel?: unknown
  userEmail?: string | null
}) => {
  const mapped = await findTallerServicioForConcept({ conceptoId, ciclo, plantel })
  if (!mapped) return { ok: true, mapped: false, changed: false, servicio: null }
  const updated = await updateCentralMatriculaServicio({ matricula, action: 'add', servicio: mapped.nombre, userEmail })
  return { ok: true, mapped: true, changed: updated.changed, servicio: mapped, servicios: updated.servicios }
}

export const serializeServicios = serializeServiciosCsv
