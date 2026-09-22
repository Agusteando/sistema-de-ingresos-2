import { query, executeStatementTransaction, type SqlStatement } from './db'
import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { readTalleresAssignmentSummaries, recordTalleresAssignmentChange } from './talleres-contracts'
import { normalizeCicloKey, formatCicloLabel } from '../../shared/utils/ciclo'
import {
  DEFAULT_TALLERES_SERVICIOS,
  FINAL_TALLERES,
  canonicalTallerKey,
  buildFinancialConceptMappingIndexes,
  resolveFinancialConceptMapping,
  finalTallerSeed,
  isKnownTallerCatalogKey,
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

export type ConceptMappedServicioEvidence = {
  conceptoId: number
  conceptoNombre: string
  documentosActivos: number
  documentoConceptoId?: number
  documentoConceptoNombre?: string
  matchedBy?: 'id' | 'name'
}

export type ConceptMappedServicioAssignment = {
  clave: string
  nombre: string
  imagen: string
  conceptosFinancieros: ConceptMappedServicioEvidence[]
}

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const compactText = (value: unknown, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength)
const normalizeMatricula = (value: unknown) => compactText(value, 64).toUpperCase()
const truthy = (value: unknown) => value === undefined || value === null ? true : Number(value) !== 0

// /conceptos uses the financial campus code while Portal Tallerista keeps
// public, grade-split campus codes. Prefer an exact mapping when one exists,
// then its financial alias, and finally GLOBAL.
const conceptMappingPlantelCandidates = (value: unknown) => {
  const raw = compactText(value, 40).toUpperCase()
  const aliases: Record<string, string> = {
    PMA: 'PM',
    PMB: 'PM',
    PREET: 'CT',
    CM: 'PREEM',
  }
  return Array.from(new Set([raw, aliases[raw], 'GLOBAL'].filter(Boolean)))
}

const cycleCandidatesFor = (value: unknown) => {
  const cicloKey = normalizeCicloKey(value)
  return Array.from(new Set([cicloKey, formatCicloLabel(cicloKey)].filter(Boolean)))
}

const defaultCatalogRows = () => DEFAULT_TALLERES_SERVICIOS.map((item) => ({
  servicio_clave: item.clave,
  servicio_nombre: item.nombre,
  imagen_url: item.imagen,
  activo: 1,
  orden: item.orden,
  sync_version: 1,
  updated_by: null,
}))

const normalizeCatalogRow = (row: any): TallerServicioCatalogRow | null => {
  const rawKey = normalizeServicioClave(row?.servicio_clave || row?.clave || row?.servicio_nombre || row?.nombre)
  const tallerSeed = isKnownTallerCatalogKey(rawKey) ? finalTallerSeed(rawKey) : null
  if (isKnownTallerCatalogKey(rawKey) && !tallerSeed) return null

  const seed = tallerSeed || serviceSeedByKey(rawKey) || serviceSeedByName(row?.servicio_nombre)
  const clave = tallerSeed?.clave || normalizeServicioClave(row?.servicio_clave || row?.clave || row?.servicio_nombre || seed?.clave)
  const nombre = tallerSeed?.nombre || normalizeServicioNombre(row?.servicio_nombre || row?.nombre || seed?.nombre || clave)
  return {
    servicio_clave: clave,
    servicio_nombre: nombre,
    imagen_url: compactText(row?.imagen_url || row?.imagen || seed?.imagen || (clave ? `/talleres-servicios/${clave}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE), 255),
    activo: truthy(row?.activo) ? 1 : 0,
    orden: Number(tallerSeed?.orden ? 500 + tallerSeed.orden : (row?.orden || seed?.orden || 9999)),
    sync_version: Number(row?.sync_version || 1),
    updated_by: row?.updated_by || null,
  }
}

const sortCatalog = (rows: TallerServicioCatalogRow[]) => [...rows]
  .filter((row) => row.servicio_clave && row.servicio_nombre)
  .sort((a, b) => Number(a.orden || 9999) - Number(b.orden || 9999) || a.servicio_nombre.localeCompare(b.servicio_nombre, 'es'))

const dedupeCatalog = (rows: TallerServicioCatalogRow[]) => {
  const map = new Map<string, TallerServicioCatalogRow>()
  for (const rawRow of rows) {
    const row = normalizeCatalogRow(rawRow)
    if (!row?.servicio_clave) continue
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

export const readFinalTalleresCatalog = async () => {
  const combined = await readBestTalleresServiciosCatalog()
  const byCanonicalKey = new Map<string, TallerServicioCatalogRow>()

  for (const row of combined.catalog) {
    const key = canonicalTallerKey(row.servicio_clave || row.servicio_nombre)
    if (!key || byCanonicalKey.has(key)) continue
    byCanonicalKey.set(key, row)
  }

  const catalog = FINAL_TALLERES.map((seed) => {
    const existing = byCanonicalKey.get(seed.clave)
    return {
      servicio_clave: seed.clave,
      servicio_nombre: seed.nombre,
      imagen_url: compactText(existing?.imagen_url || seed.imagen || DEFAULT_TALLER_SERVICIO_IMAGE, 255),
      activo: 1,
      orden: seed.orden,
      sync_version: existing?.sync_version || 1,
      updated_by: existing?.updated_by || null,
    } satisfies TallerServicioCatalogRow
  })

  return { source: combined.source, catalog }
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
  const columns = await getCentralTableColumns('matricula')
  const plantelSql = columns.has('plantel') ? 'plantel' : 'NULL AS plantel'
  const cicloSql = columns.has('ciclo') ? 'CAST(ciclo AS CHAR) AS ciclo' : 'NULL AS ciclo'
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${escapeIdentifier(field)} AS servicios, ${plantelSql}, ${cicloSql}
       FROM matricula
      WHERE UPPER(TRIM(matricula)) = ?
      LIMIT 1`,
    [key]
  )
  if (!rows.length) {
    throw createError({ statusCode: 404, message: 'La matrícula no existe en Control Escolar; no se pudo actualizar Talleres.' })
  }
  const raw = rows[0]?.servicios || ''
  return {
    field,
    raw: compactText(raw, 5000),
    servicios: parseServiciosCsv(raw),
    plantel: compactText(rows[0]?.plantel, 40).toUpperCase(),
    ciclo: compactText(rows[0]?.ciclo, 40),
  }
}

export const resolveServiciosWithCatalog = async (servicios: unknown[]) => {
  const { catalog, source } = await readBestTalleresServiciosCatalog()
  const byKey = new Map(catalog.map((item) => [item.servicio_clave, item]))
  const resolved = servicios.map((value) => {
    const nombre = normalizeServicioNombre(value)
    const key = canonicalTallerKey(nombre)
    const catalogItem = byKey.get(key) || serviceSeedByKey(key)
    return {
      clave: key,
      nombre: catalogItem?.servicio_nombre || finalTallerSeed(key)?.nombre || nombre,
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
    const result = await controlEscolarCentralQuery<any>(
      `UPDATE matricula SET ${assignments.join(', ')} WHERE UPPER(TRIM(matricula)) = ?`,
      params
    )
    if (Number(result?.affectedRows || 0) < 1) {
      throw createError({ statusCode: 409, message: 'Control Escolar no confirmó la actualización de Talleres para esta matrícula.' })
    }
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
  const cycleCandidates = cycleCandidatesFor(ciclo)
  const plantelCandidates = conceptMappingPlantelCandidates(plantel)
  const cycleWhere = cycleCandidates.length ? `AND cycle_name IN (${cycleCandidates.map(() => '?').join(',')})` : ''
  const plantelWhere = plantelCandidates.length ? `AND UPPER(TRIM(plantel)) IN (${plantelCandidates.map(() => '?').join(',')})` : ''

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT id, plantel, servicio_clave, servicio_nombre
       FROM config_enrollment_mappings
      WHERE concepto_id = ?
        AND IFNULL(activo, 1) = 1
        AND LOWER(TRIM(IFNULL(enrollment_type, 'regular'))) IN ('talleres_servicios', 'talleres', 'talleres_y_servicios')
        AND COALESCE(NULLIF(TRIM(servicio_clave), ''), NULLIF(TRIM(servicio_nombre), '')) IS NOT NULL
        ${cycleWhere}
        ${plantelWhere}
       ORDER BY id DESC`,
    [id, ...cycleCandidates, ...plantelCandidates]
  )
  const row = [...rows].sort((left, right) => {
    const leftRank = plantelCandidates.indexOf(compactText(left?.plantel, 40).toUpperCase())
    const rightRank = plantelCandidates.indexOf(compactText(right?.plantel, 40).toUpperCase())
    return leftRank - rightRank || Number(right?.id || 0) - Number(left?.id || 0)
  })[0]
  if (!row) return null
  const catalog = await readBestTalleresServiciosCatalog()
  const normalizedKey = canonicalTallerKey(row.servicio_clave || row.servicio_nombre)
  const match = catalog.catalog.find((item) => item.servicio_clave === normalizedKey) || serviceSeedByKey(normalizedKey)
  return {
    clave: normalizedKey,
    nombre: match?.servicio_nombre || normalizeServicioNombre(row.servicio_nombre),
    imagen: match?.imagen_url || (normalizedKey ? `/talleres-servicios/${normalizedKey}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE),
  }
}

const readConceptMappedServicios = async ({ ciclo, plantel }: { ciclo?: unknown, plantel?: unknown }) => {
  const cycleCandidates = cycleCandidatesFor(ciclo)
  const plantelCandidates = conceptMappingPlantelCandidates(plantel)
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT id, plantel, concepto_id, concepto_nombre, servicio_clave, servicio_nombre
       FROM config_enrollment_mappings
      WHERE IFNULL(activo, 1) = 1
        AND LOWER(TRIM(IFNULL(enrollment_type, 'regular'))) IN ('talleres_servicios', 'talleres', 'talleres_y_servicios')
        AND COALESCE(NULLIF(TRIM(servicio_clave), ''), NULLIF(TRIM(servicio_nombre), '')) IS NOT NULL
        AND cycle_name IN (${cycleCandidates.map(() => '?').join(',')})
        AND UPPER(TRIM(plantel)) IN (${plantelCandidates.map(() => '?').join(',')})
      ORDER BY id DESC`,
    [...cycleCandidates, ...plantelCandidates]
  )

  const selected = new Map<number, any>()
  for (const row of rows) {
    const conceptoId = Number(row?.concepto_id || 0)
    if (!conceptoId) continue
    const candidate = {
      ...row,
      plantelRank: plantelCandidates.indexOf(compactText(row?.plantel, 40).toUpperCase()),
    }
    const current = selected.get(conceptoId)
    if (!current || candidate.plantelRank < current.plantelRank || (
      candidate.plantelRank === current.plantelRank && Number(candidate.id || 0) > Number(current.id || 0)
    )) selected.set(conceptoId, candidate)
  }

  const mappings = Array.from(selected.entries()).map(([conceptoId, row]) => {
    const clave = canonicalTallerKey(row.servicio_clave || row.servicio_nombre)
    // The active Aurora catalog remains authoritative for business identity.
    // This row only describes how a financial concept maps into that identity.
    const item = serviceSeedByKey(clave)
    return {
      conceptoId,
      conceptoNombre: compactText(row.concepto_nombre, 255),
      clave,
      nombre: item?.servicio_nombre || finalTallerSeed(clave)?.nombre || normalizeServicioNombre(row.servicio_nombre),
      imagen: item?.imagen_url || (clave ? `/talleres-servicios/${clave}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE),
    }
  }).filter((row) => row.clave && row.nombre)

  return {
    ...buildFinancialConceptMappingIndexes(mappings),
    mappingCount: mappings.length,
  }
}

const readActiveMappedConceptRows = async (matriculas: string[], ciclo: unknown) => {
  if (!matriculas.length) return []
  const cycleCandidates = cycleCandidatesFor(ciclo)
  let hasPeriodTable = false
  try {
    const tables = await query<any[]>(`SHOW TABLES LIKE 'documento_concepto_periodos'`)
    hasPeriodTable = tables.length > 0
  } catch {}

  const rows: any[] = []
  for (let offset = 0; offset < matriculas.length; offset += 250) {
    const chunk = matriculas.slice(offset, offset + 250)
    const periodJoin = hasPeriodTable
      ? `LEFT JOIN documento_concepto_periodos P
           ON P.id = (
             SELECT P2.id
               FROM documento_concepto_periodos P2
              WHERE P2.documento = D.documento
                AND LOWER(TRIM(CAST(P2.estatus AS CHAR))) = 'activo'
              ORDER BY P2.start_mes DESC, P2.id DESC
              LIMIT 1
           )`
      : ''
    const effectiveConcept = hasPeriodTable ? 'COALESCE(P.concepto_id, D.concepto)' : 'D.concepto'
    const effectiveConceptName = hasPeriodTable
      ? "COALESCE(NULLIF(TRIM(CAST(P.conceptoNombre AS CHAR)), ''), D.conceptoNombre)"
      : 'D.conceptoNombre'
    const activePeriod = hasPeriodTable
      ? `AND (P.id IS NULL OR LOWER(TRIM(CAST(P.accion AS CHAR))) <> 'cancelacion')`
      : ''
    const batch = await query<any[]>(
      `SELECT UPPER(TRIM(D.matricula)) AS matricula,
              CAST(${effectiveConcept} AS UNSIGNED) AS concepto_id,
              TRIM(CAST(${effectiveConceptName} AS CHAR)) AS concepto_nombre,
              COUNT(DISTINCT D.documento) AS documentos_activos
         FROM documentos D
         ${periodJoin}
        WHERE CAST(D.ciclo AS CHAR) IN (${cycleCandidates.map(() => '?').join(',')})
          AND LOWER(TRIM(CAST(D.estatus AS CHAR))) = 'activo'
          AND UPPER(TRIM(D.matricula)) IN (${chunk.map(() => '?').join(',')})
          ${activePeriod}
        GROUP BY UPPER(TRIM(D.matricula)),
                 CAST(${effectiveConcept} AS UNSIGNED),
                 TRIM(CAST(${effectiveConceptName} AS CHAR))`,
      [...cycleCandidates, ...chunk]
    )
    rows.push(...batch)
  }
  return rows
}

/**
 * Resolves legacy/current financial workshop assignments without mutating
 * matricula.servicio(s). This is intentionally read-time evidence so existing
 * production charges become visible even if they predate the write-through
 * performed by appendConceptMappedServicioToMatricula.
 */
export const readConceptMappedServiciosForMatriculas = async ({
  matriculas,
  ciclo,
  plantel,
}: {
  matriculas: unknown[]
  ciclo?: unknown
  plantel?: unknown
}) => {
  const unique = Array.from(new Set(matriculas.map(normalizeMatricula).filter(Boolean)))
  const result = new Map<string, ConceptMappedServicioAssignment[]>()
  const mappings = await readConceptMappedServicios({ ciclo, plantel })
  if (!unique.length || !mappings.mappingCount) return { result, mappingCount: mappings.mappingCount, evidenceCount: 0 }

  const rows = await readActiveMappedConceptRows(unique, ciclo)
  const byStudent = new Map<string, Map<string, ConceptMappedServicioAssignment>>()
  let evidenceCount = 0
  for (const row of rows) {
    const matricula = normalizeMatricula(row?.matricula)
    const resolution = resolveFinancialConceptMapping(mappings, {
      conceptoId: row?.concepto_id,
      conceptoNombre: row?.concepto_nombre,
    })
    const mapped = resolution?.mapping
    if (!matricula || !mapped || !resolution) continue
    evidenceCount += 1
    const services = byStudent.get(matricula) || new Map<string, ConceptMappedServicioAssignment>()
    const service = services.get(mapped.clave) || {
      clave: mapped.clave,
      nombre: mapped.nombre,
      imagen: mapped.imagen,
      conceptosFinancieros: [],
    }
    service.conceptosFinancieros.push({
      conceptoId: Number(mapped.conceptoId || 0),
      conceptoNombre: compactText(mapped.conceptoNombre, 255),
      documentosActivos: Number(row?.documentos_activos || 0),
      documentoConceptoId: Number(row?.concepto_id || 0) || undefined,
      documentoConceptoNombre: compactText(row?.concepto_nombre, 255) || undefined,
      matchedBy: resolution.matchedBy,
    })
    services.set(mapped.clave, service)
    byStudent.set(matricula, services)
  }

  for (const [matricula, services] of byStudent) {
    result.set(matricula, Array.from(services.values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es')))
  }
  return { result, mappingCount: mappings.mappingCount, evidenceCount }
}

export const readEffectiveStudentServicios = async ({
  matricula,
  ciclo,
  plantel,
}: {
  matricula: unknown
  ciclo?: unknown
  plantel?: unknown
}) => {
  const key = normalizeMatricula(matricula)
  const current = await readCentralMatriculaServicios(key)
  const resolved = await resolveServiciosWithCatalog(current.servicios)
  const effectiveCiclo = normalizeCicloKey(ciclo || current.ciclo)
  const effectivePlantel = compactText(plantel || current.plantel, 40).toUpperCase()
  const financial = await readConceptMappedServiciosForMatriculas({
    matriculas: [key],
    ciclo: effectiveCiclo,
    plantel: effectivePlantel,
  })

  const byKey = new Map<string, any>()
  for (const item of resolved.servicios) {
    const clave = canonicalTallerKey(item?.clave || item?.nombre)
    if (!clave) continue
    byKey.set(clave, {
      ...item,
      clave,
      source: 'matricula',
      fuentes: ['matricula'],
      directa: true,
      conceptosFinancieros: [],
    })
  }

  for (const item of financial.result.get(key) || []) {
    const clave = canonicalTallerKey(item?.clave || item?.nombre)
    if (!clave) continue
    const existing = byKey.get(clave)
    if (existing) {
      byKey.set(clave, {
        ...existing,
        fuentes: Array.from(new Set([...(existing.fuentes || []), 'concepto_financiero'])),
        conceptosFinancieros: item.conceptosFinancieros || [],
      })
      continue
    }
    byKey.set(clave, {
      ...item,
      clave,
      source: 'concepto_financiero',
      fuentes: ['concepto_financiero'],
      directa: false,
    })
  }

  return {
    current,
    resolved,
    financial,
    ciclo: effectiveCiclo,
    plantel: effectivePlantel,
    servicios: Array.from(byKey.values()).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es')),
  }
}

const readCurrentFinancialTallerKeys = async ({
  matricula,
  ciclo,
  plantel,
}: {
  matricula: unknown
  ciclo?: unknown
  plantel?: unknown
}) => {
  const key = normalizeMatricula(matricula)
  const financial = await readConceptMappedServiciosForMatriculas({ matriculas: [key], ciclo, plantel })
  return new Set((financial.result.get(key) || []).map((item) => canonicalTallerKey(item?.clave || item?.nombre)).filter(Boolean))
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
  if (updated.changed) {
    await recordTalleresAssignmentChange({
      matricula,
      plantel: plantel || 'GLOBAL',
      workshopKey: mapped.clave,
      workshopName: mapped.nombre,
      action: 'assigned',
      actorEmail: userEmail,
      metadata: { source: 'financial_concept', conceptoId: Number(conceptoId || 0), ciclo: ciclo || null },
    })
  }
  return { ok: true, mapped: true, changed: updated.changed, servicio: mapped, servicios: updated.servicios }
}

export const syncChangedConceptMappedServicioToMatricula = async ({
  matricula,
  previousConceptoId,
  nextConceptoId,
  ciclo,
  plantel,
  userEmail,
}: {
  matricula: unknown
  previousConceptoId: unknown
  nextConceptoId: unknown
  ciclo?: unknown
  plantel?: unknown
  userEmail?: string | null
}) => {
  const [previousMapped, nextMapped] = await Promise.all([
    findTallerServicioForConcept({ conceptoId: previousConceptoId, ciclo, plantel }),
    findTallerServicioForConcept({ conceptoId: nextConceptoId, ciclo, plantel }),
  ])

  let updated: any = { ok: true, changed: false, servicios: undefined }
  if (nextMapped) {
    updated = await updateCentralMatriculaServicio({
      matricula,
      action: 'add',
      servicio: nextMapped.nombre,
      userEmail,
    })
  }

  const matriculaKey = normalizeMatricula(matricula)
  const [financialKeys, assignmentHistory] = await Promise.all([
    readCurrentFinancialTallerKeys({ matricula, ciclo, plantel }),
    readTalleresAssignmentSummaries([matriculaKey]),
  ])
  const history = assignmentHistory.result.get(matriculaKey) || {}
  const previousKey = canonicalTallerKey(previousMapped?.clave || previousMapped?.nombre)
  const nextKey = canonicalTallerKey(nextMapped?.clave || nextMapped?.nombre)
  const previousState = previousKey ? history[previousKey] : null
  const nextState = nextKey ? history[nextKey] : null
  const previousFinanciallyManaged = String(previousState?.lastSource || '').startsWith('financial_concept')
  const nextFinanciallyManaged = String(nextState?.lastSource || '').startsWith('financial_concept')

  if (
    previousMapped
    && previousKey
    && previousKey !== nextKey
    && !financialKeys.has(previousKey)
    && previousFinanciallyManaged
    && String(previousState?.lastAction || '').toLowerCase() !== 'removed'
  ) {
    await recordTalleresAssignmentChange({
      matricula,
      plantel: plantel || 'GLOBAL',
      workshopKey: previousMapped.clave,
      workshopName: previousMapped.nombre,
      action: 'removed',
      actorEmail: userEmail,
      metadata: {
        source: 'financial_concept_change',
        conceptoId: Number(previousConceptoId || 0),
        nextConceptoId: Number(nextConceptoId || 0),
        ciclo: ciclo || null,
      },
    })
  }

  if (
    nextMapped
    && nextKey
    && financialKeys.has(nextKey)
    && previousKey !== nextKey
    && (Boolean(updated?.changed) || nextFinanciallyManaged)
  ) {
    await recordTalleresAssignmentChange({
      matricula,
      plantel: plantel || 'GLOBAL',
      workshopKey: nextMapped.clave,
      workshopName: nextMapped.nombre,
      action: 'assigned',
      actorEmail: userEmail,
      metadata: {
        source: 'financial_concept_change',
        conceptoId: Number(nextConceptoId || 0),
        previousConceptoId: Number(previousConceptoId || 0),
        ciclo: ciclo || null,
      },
    })
  }

  return {
    ok: true,
    mapped: Boolean(nextMapped),
    changed: Boolean(updated?.changed),
    previousServicio: previousMapped || null,
    servicio: nextMapped || null,
    servicios: updated?.servicios,
    financialKeys: Array.from(financialKeys),
  }
}

export const syncCancelledConceptMappedServicioOnMatricula = async ({
  matricula,
  previousConceptoId,
  ciclo,
  plantel,
  userEmail,
}: {
  matricula: unknown
  previousConceptoId: unknown
  ciclo?: unknown
  plantel?: unknown
  userEmail?: string | null
}) => {
  const previousMapped = await findTallerServicioForConcept({ conceptoId: previousConceptoId, ciclo, plantel })
  if (!previousMapped) return { ok: true, mapped: false, changed: false, previousServicio: null }

  const matriculaKey = normalizeMatricula(matricula)
  const [financialKeys, assignmentHistory] = await Promise.all([
    readCurrentFinancialTallerKeys({ matricula, ciclo, plantel }),
    readTalleresAssignmentSummaries([matriculaKey]),
  ])
  const previousKey = canonicalTallerKey(previousMapped.clave || previousMapped.nombre)
  const previousState = previousKey ? (assignmentHistory.result.get(matriculaKey) || {})[previousKey] : null
  const financiallyManaged = String(previousState?.lastSource || '').startsWith('financial_concept')
  const removed = Boolean(
    previousKey
    && !financialKeys.has(previousKey)
    && financiallyManaged
    && String(previousState?.lastAction || '').toLowerCase() !== 'removed'
  )

  if (removed) {
    await recordTalleresAssignmentChange({
      matricula,
      plantel: plantel || 'GLOBAL',
      workshopKey: previousMapped.clave,
      workshopName: previousMapped.nombre,
      action: 'removed',
      actorEmail: userEmail,
      metadata: {
        source: 'financial_concept_cancel',
        conceptoId: Number(previousConceptoId || 0),
        ciclo: ciclo || null,
      },
    })
  }

  return {
    ok: true,
    mapped: true,
    changed: removed,
    previousServicio: previousMapped,
    financialKeys: Array.from(financialKeys),
  }
}

export const serializeServicios = serializeServiciosCsv
