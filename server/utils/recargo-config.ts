import { controlEscolarCentralQuery } from './control-escolar-central'
import { query } from './db'

// External schema is intentionally manual; this module only reads/writes central data.
const RECARGO_TABLE = 'concepto_recargo_config'
const DEFAULT_PERCENTAGE = 10
const DEFAULT_CUTOFF_DAY = 12
const CENTRAL_RETRY_MS = 15_000
const CENTRAL_OPERATION_TIMEOUT_MS = 1_800

export type RecargoPolicy = {
  conceptoId: number
  activo: boolean
  porcentaje: number
  diaLimite: number
  version: number
  updatedAt: string | null
  updatedBy: string | null
  source: 'central' | 'bridge'
  pendingSync: boolean
  explicit: boolean
}

type StoredRecargoRow = {
  concepto_id?: number | string | null
  activo?: number | string | boolean | null
  porcentaje?: number | string | null
  dia_limite?: number | string | null
  version?: number | string | null
  updated_at?: string | Date | null
  updated_by?: string | null
  pending_sync?: number | string | boolean | null
}

type LegacyConceptRow = {
  id?: number | string | null
  eventual?: number | string | boolean | null
}

let centralUnavailableUntil = 0
let centralFailureLoggedAt = 0

const normalizeIds = (values: unknown[]) => Array.from(new Set(values
  .map(value => Number(value || 0))
  .filter(value => Number.isInteger(value) && value > 0)))

const boolFlag = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())

const normalizePercentage = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_PERCENTAGE
}

const normalizeCutoffDay = (value: unknown) => {
  const parsed = Math.trunc(Number(value))
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 28 ? parsed : DEFAULT_CUTOFF_DAY
}

const rowToPolicy = (row: StoredRecargoRow, source: RecargoPolicy['source'], explicit = true): RecargoPolicy => ({
  conceptoId: Number(row.concepto_id || 0),
  activo: boolFlag(row.activo),
  porcentaje: normalizePercentage(row.porcentaje),
  diaLimite: normalizeCutoffDay(row.dia_limite),
  version: Math.max(0, Number(row.version || 0) || 0),
  updatedAt: row.updated_at ? String(row.updated_at) : null,
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  source,
  pendingSync: boolFlag(row.pending_sync),
  explicit,
})

const legacyPolicy = (conceptoId: number, eventual: unknown, source: RecargoPolicy['source']): RecargoPolicy => ({
  conceptoId,
  activo: !boolFlag(eventual),
  porcentaje: DEFAULT_PERCENTAGE,
  diaLimite: DEFAULT_CUTOFF_DAY,
  version: 0,
  updatedAt: null,
  updatedBy: null,
  source,
  pendingSync: false,
  explicit: false,
})

const emptyPolicy = (conceptoId: number, source: RecargoPolicy['source']): RecargoPolicy => ({
  conceptoId,
  activo: false,
  porcentaje: DEFAULT_PERCENTAGE,
  diaLimite: DEFAULT_CUTOFF_DAY,
  version: 0,
  updatedAt: null,
  updatedBy: null,
  source,
  pendingSync: false,
  explicit: false,
})

const placeholders = (ids: number[]) => ids.map(() => '?').join(',')

const markCentralAvailable = () => {
  centralUnavailableUntil = 0
}

const markCentralUnavailable = (error: any) => {
  centralUnavailableUntil = Date.now() + CENTRAL_RETRY_MS
  if (Date.now() - centralFailureLoggedAt > CENTRAL_RETRY_MS) {
    centralFailureLoggedAt = Date.now()
    console.warn('[Recargos] Base central no disponible; se usa la configuración del bridge.', error?.message || error)
  }
}

const canTryCentral = () => Date.now() >= centralUnavailableUntil

const runCentral = async <T>(operation: () => Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const error: any = new Error('La base central de recargos no respondió a tiempo.')
          error.code = 'RECARGO_CENTRAL_TIMEOUT'
          reject(error)
        }, CENTRAL_OPERATION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}


const readLegacyConceptsFromBridge = async (ids: number[]) => {
  if (!ids.length) return new Map<number, LegacyConceptRow>()
  const rows = await query<LegacyConceptRow[]>(
    `SELECT id, eventual FROM conceptos WHERE id IN (${placeholders(ids)})`,
    ids,
  )
  return new Map(rows.map(row => [Number(row.id || 0), row]))
}

const readLegacyConceptsFromCentral = async (ids: number[]) => {
  if (!ids.length) return new Map<number, LegacyConceptRow>()
  const rows = await runCentral(() => controlEscolarCentralQuery<LegacyConceptRow[]>(
    `SELECT id, eventual FROM conceptos WHERE id IN (${placeholders(ids)})`,
    ids,
  ))
  return new Map(rows.map(row => [Number(row.id || 0), row]))
}

const readBridgePolicies = async (conceptIds: number[]) => {
  const ids = normalizeIds(conceptIds)
  const result = new Map<number, RecargoPolicy>()
  if (!ids.length) return result

  const rows = await query<StoredRecargoRow[]>(
    `SELECT concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by, pending_sync
     FROM ${RECARGO_TABLE}
     WHERE concepto_id IN (${placeholders(ids)})`,
    ids,
  )
  rows.forEach(row => {
    const policy = rowToPolicy(row, 'bridge')
    if (policy.conceptoId) result.set(policy.conceptoId, policy)
  })

  const missing = ids.filter(id => !result.has(id))
  const legacy = await readLegacyConceptsFromBridge(missing)
  missing.forEach((id) => {
    const concept = legacy.get(id)
    result.set(id, concept ? legacyPolicy(id, concept.eventual, 'bridge') : emptyPolicy(id, 'bridge'))
  })
  return result
}

const readCentralPolicies = async (conceptIds: number[]) => {
  const ids = normalizeIds(conceptIds)
  const result = new Map<number, RecargoPolicy>()
  if (!ids.length) return result

  const rows = await runCentral(() => controlEscolarCentralQuery<StoredRecargoRow[]>(
    `SELECT concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by
     FROM ${RECARGO_TABLE}
     WHERE concepto_id IN (${placeholders(ids)})`,
    ids,
  ))
  rows.forEach(row => {
    const policy = rowToPolicy(row, 'central')
    if (policy.conceptoId) result.set(policy.conceptoId, policy)
  })

  const missing = ids.filter(id => !result.has(id))
  const legacy = await readLegacyConceptsFromCentral(missing)
  missing.forEach((id) => {
    const concept = legacy.get(id)
    result.set(id, concept ? legacyPolicy(id, concept.eventual, 'central') : emptyPolicy(id, 'central'))
  })
  return result
}

const mirrorPolicyToBridge = async (policy: RecargoPolicy, pendingSync = false) => {
  await query(
    `INSERT INTO ${RECARGO_TABLE}
      (concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by, pending_sync)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?)
     ON DUPLICATE KEY UPDATE
       activo = VALUES(activo),
       porcentaje = VALUES(porcentaje),
       dia_limite = VALUES(dia_limite),
       version = VALUES(version),
       updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by),
       pending_sync = VALUES(pending_sync)`,
    [
      policy.conceptoId,
      policy.activo ? 1 : 0,
      policy.porcentaje,
      policy.diaLimite,
      policy.version,
      policy.updatedAt,
      policy.updatedBy,
      pendingSync ? 1 : 0,
    ],
  )
}

const readPendingBridgePolicies = async () => {
  const rows = await query<StoredRecargoRow[]>(
    `SELECT concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by, pending_sync
     FROM ${RECARGO_TABLE}
     WHERE pending_sync = 1
     ORDER BY updated_at ASC, concepto_id ASC`,
  )
  return rows.map(row => rowToPolicy(row, 'bridge'))
}

const readCentralPolicyRow = async (conceptoId: number) => {
  const rows = await runCentral(() => controlEscolarCentralQuery<StoredRecargoRow[]>(
    `SELECT concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by
     FROM ${RECARGO_TABLE}
     WHERE concepto_id = ?
     LIMIT 1`,
    [conceptoId],
  ))
  return rows[0] ? rowToPolicy(rows[0], 'central') : null
}

const pushPolicyToCentral = async (policy: RecargoPolicy) => {
  await runCentral(() => controlEscolarCentralQuery(
    `INSERT INTO ${RECARGO_TABLE}
      (concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by)
     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE
       activo = VALUES(activo),
       porcentaje = VALUES(porcentaje),
       dia_limite = VALUES(dia_limite),
       version = version + 1,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = VALUES(updated_by)`,
    [policy.conceptoId, policy.activo ? 1 : 0, policy.porcentaje, policy.diaLimite, policy.updatedBy],
  ))
  const saved = await readCentralPolicyRow(policy.conceptoId)
  if (!saved) throw new Error('La configuración central de recargo no pudo confirmarse.')
  return saved
}

export const flushPendingRecargoPolicies = async () => {
  if (!canTryCentral()) return false
  const pending = await readPendingBridgePolicies()
  if (!pending.length) return true

  try {
    for (const policy of pending) {
      const saved = await pushPolicyToCentral(policy)
      await mirrorPolicyToBridge(saved, false)
    }
    markCentralAvailable()
    return true
  } catch (error) {
    markCentralUnavailable(error)
    return false
  }
}

export const loadRecargoPolicies = async (conceptIds: unknown[]) => {
  const ids = normalizeIds(conceptIds)
  const bridgePolicies = await readBridgePolicies(ids)
  if (!ids.length || !canTryCentral()) return bridgePolicies

  try {
    await flushPendingRecargoPolicies()
    if (!canTryCentral()) return bridgePolicies

    const centralPolicies = await readCentralPolicies(ids)
    for (const policy of centralPolicies.values()) {
      await mirrorPolicyToBridge(policy, false)
    }
    markCentralAvailable()
    return centralPolicies
  } catch (error) {
    markCentralUnavailable(error)
    return bridgePolicies
  }
}

export const setRecargoPolicyActive = async ({
  conceptoId,
  activo,
  updatedBy,
}: {
  conceptoId: unknown
  activo: unknown
  updatedBy?: string | null
}) => {
  const id = Number(conceptoId || 0)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Concepto inválido.' })
  }

  const normalizedActive = typeof activo === 'boolean' ? activo : boolFlag(activo)
  const actor = String(updatedBy || '').trim().slice(0, 255) || null

  if (canTryCentral()) {
    try {
      await runCentral(() => controlEscolarCentralQuery(
        `INSERT INTO ${RECARGO_TABLE}
          (concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by)
         VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
         ON DUPLICATE KEY UPDATE
           activo = VALUES(activo),
           version = version + 1,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = VALUES(updated_by)`,
        [id, normalizedActive ? 1 : 0, DEFAULT_PERCENTAGE, DEFAULT_CUTOFF_DAY, actor],
      ))
      const saved = await readCentralPolicyRow(id)
      if (!saved) throw new Error('La configuración central de recargo no pudo confirmarse.')
      await mirrorPolicyToBridge(saved, false)
      markCentralAvailable()
      return saved
    } catch (error) {
      markCentralUnavailable(error)
    }
  }

  await query(
    `INSERT INTO ${RECARGO_TABLE}
      (concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by, pending_sync)
     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, 1)
     ON DUPLICATE KEY UPDATE
       activo = VALUES(activo),
       version = version + 1,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = VALUES(updated_by),
       pending_sync = 1`,
    [id, normalizedActive ? 1 : 0, DEFAULT_PERCENTAGE, DEFAULT_CUTOFF_DAY, actor],
  )

  const rows = await query<StoredRecargoRow[]>(
    `SELECT concepto_id, activo, porcentaje, dia_limite, version, updated_at, updated_by, pending_sync
     FROM ${RECARGO_TABLE}
     WHERE concepto_id = ?
     LIMIT 1`,
    [id],
  )
  const fallback = rows[0] ? rowToPolicy(rows[0], 'bridge') : emptyPolicy(id, 'bridge')
  fallback.pendingSync = true
  fallback.explicit = true
  return fallback
}
