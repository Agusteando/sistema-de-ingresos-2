import type mysql from 'mysql2/promise'
import { query, executeStatementTransaction, type SqlStatement } from './db'
import { controlEscolarCentralQuery, getControlEscolarCentralDb } from './control-escolar-central'
import { getTrustedAuthUser, type AuthSessionUser } from './auth-session'
import { CONCEPTOS_PLANTELES_LIST, isConceptosPlantel } from '../../utils/constants'

export type ConceptoStockStatus = 'uncontrolled' | 'available' | 'low' | 'out'
export type StockSource = 'central' | 'bridge'

export type ConceptoStockSnapshot = {
  concepto_id: number
  plantel: string
  controlled: boolean
  stock_enabled: boolean
  status: ConceptoStockStatus
  on_hand: number | null
  reserved: number
  available: number | null
  reorder_point: number
  allow_negative: boolean
  unit_label: string
  updated_at?: string | null
  source?: StockSource
}

export type StockReservation = {
  controlled: boolean
  source: StockSource
  concepto_id: number
  plantel: string
  quantity: number
  movement_id?: number | null
  idempotency_key?: string | null
}

const STOCK_TABLES = ['concepto_stock_settings', 'concepto_stock_balances', 'concepto_stock_movements']
const DEFAULT_UNIT_LABEL = 'unidad'

const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase()
const visiblePlantelParams = () => CONCEPTOS_PLANTELES_LIST.map((plantel) => String(plantel).toUpperCase())
const isVisiblePlantel = (plantel: unknown) => isConceptosPlantel(normalizePlantel(plantel))
const visiblePlantelWhere = (column = 'plantel') => `${column} IN (${CONCEPTOS_PLANTELES_LIST.map(() => '?').join(',')})`
const normalizeText = (value: unknown, maxLength = 255) => String(value ?? '').trim().slice(0, maxLength)
const toInt = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
const toPositiveInt = (value: unknown, fallback = 1) => Math.max(1, toInt(value, fallback))
const isTruthy = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
const isMissingStockSchemaError = (error: any) => ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(String(error?.code || error?.cause?.code || error?.data?.diagnostic?.code || '').toUpperCase())

const statusFor = (controlled: boolean, onHand: number | null, reserved: number, reorderPoint: number, allowNegative: boolean): ConceptoStockStatus => {
  if (!controlled) return 'uncontrolled'
  const available = Math.max(0, Number(onHand || 0) - Number(reserved || 0))
  if (!allowNegative && available <= 0) return 'out'
  if (reorderPoint > 0 && available <= reorderPoint) return 'low'
  return 'available'
}

export const uncontrolledStockSnapshot = (conceptoId: unknown, plantel: unknown, source?: StockSource): ConceptoStockSnapshot => ({
  concepto_id: Number(conceptoId || 0),
  plantel: normalizePlantel(plantel),
  controlled: false,
  stock_enabled: false,
  status: 'uncontrolled',
  on_hand: null,
  reserved: 0,
  available: null,
  reorder_point: 0,
  allow_negative: false,
  unit_label: DEFAULT_UNIT_LABEL,
  source
})

const normalizeSnapshotRow = (row: any, source: StockSource): ConceptoStockSnapshot => {
  const enabled = Number(row?.stock_enabled ?? row?.activo ?? 0) !== 0
  const onHand = Number(row?.on_hand ?? 0)
  const reserved = Number(row?.reserved ?? 0)
  const reorderPoint = Number(row?.reorder_point ?? 0)
  const allowNegative = Number(row?.allow_negative ?? 0) !== 0
  const available = Number(onHand) - Number(reserved)
  return {
    concepto_id: Number(row?.concepto_id || 0),
    plantel: normalizePlantel(row?.plantel),
    controlled: enabled,
    stock_enabled: enabled,
    status: statusFor(enabled, onHand, reserved, reorderPoint, allowNegative),
    on_hand: enabled ? onHand : null,
    reserved,
    available: enabled ? available : null,
    reorder_point: reorderPoint,
    allow_negative: allowNegative,
    unit_label: normalizeText(row?.unit_label || DEFAULT_UNIT_LABEL, 40) || DEFAULT_UNIT_LABEL,
    updated_at: row?.updated_at || null,
    source
  }
}

const ensureCentralStockSchema = async () => {
  for (const table of STOCK_TABLES) {
    const rows = await controlEscolarCentralQuery<any[]>(`SHOW TABLES LIKE ?`, [table])
    if (!rows.length) {
      throw createError({
        statusCode: 503,
        message: 'Las tablas de stock no están instaladas en la base externa. Ejecuta manualmente el SQL entregado para habilitar existencias.'
      })
    }
  }
}

const localStockSchemaAvailable = async () => {
  try {
    const rows = await query<any[]>(`SHOW TABLES LIKE 'concepto_stock_settings'`)
    return rows.length > 0
  } catch {
    return false
  }
}

const readCentralSnapshots = async (input: { plantel?: unknown; conceptoIds?: number[] } = {}) => {
  const plantel = normalizePlantel(input.plantel)
  const conceptoIds = Array.from(new Set((input.conceptoIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)))
  const params: any[] = []
  const where: string[] = ['IFNULL(s.activo, 1) = 1']
  if (plantel) {
    if (!isVisiblePlantel(plantel)) return []
    where.push('s.plantel = ?')
    params.push(plantel)
  } else {
    where.push(visiblePlantelWhere('s.plantel'))
    params.push(...visiblePlantelParams())
  }
  if (conceptoIds.length) {
    where.push(`s.concepto_id IN (${conceptoIds.map(() => '?').join(',')})`)
    params.push(...conceptoIds)
  }
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT
      s.concepto_id,
      s.plantel,
      s.stock_enabled,
      s.unit_label,
      s.reorder_point,
      s.allow_negative,
      s.activo,
      b.on_hand,
      b.reserved,
      GREATEST(0, IFNULL(b.on_hand, 0) - IFNULL(b.reserved, 0)) AS available,
      GREATEST(IFNULL(s.updated_at, '1970-01-01'), IFNULL(b.updated_at, '1970-01-01')) AS updated_at
    FROM concepto_stock_settings s
    LEFT JOIN concepto_stock_balances b
      ON b.concepto_id = s.concepto_id AND b.plantel = s.plantel
    WHERE ${where.join(' AND ')}
    ORDER BY s.plantel ASC, s.concepto_id ASC
  `, params)
  return rows.map((row) => normalizeSnapshotRow(row, 'central'))
}

const readBridgeSnapshots = async (input: { plantel?: unknown; conceptoIds?: number[] } = {}) => {
  if (!(await localStockSchemaAvailable())) return []
  const plantel = normalizePlantel(input.plantel)
  const conceptoIds = Array.from(new Set((input.conceptoIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)))
  const params: any[] = []
  const where: string[] = ['IFNULL(s.activo, 1) = 1']
  if (plantel) {
    if (!isVisiblePlantel(plantel)) return []
    where.push('s.plantel = ?')
    params.push(plantel)
  } else {
    where.push(visiblePlantelWhere('s.plantel'))
    params.push(...visiblePlantelParams())
  }
  if (conceptoIds.length) {
    where.push(`s.concepto_id IN (${conceptoIds.map(() => '?').join(',')})`)
    params.push(...conceptoIds)
  }
  const rows = await query<any[]>(`
    SELECT
      s.concepto_id,
      s.plantel,
      s.stock_enabled,
      s.unit_label,
      s.reorder_point,
      s.allow_negative,
      s.activo,
      b.on_hand,
      b.reserved,
      GREATEST(0, IFNULL(b.on_hand, 0) - IFNULL(b.reserved, 0)) AS available,
      GREATEST(IFNULL(s.updated_at, '1970-01-01'), IFNULL(b.updated_at, '1970-01-01')) AS updated_at
    FROM concepto_stock_settings s
    LEFT JOIN concepto_stock_balances b
      ON b.concepto_id = s.concepto_id AND b.plantel = s.plantel
    WHERE ${where.join(' AND ')}
    ORDER BY s.plantel ASC, s.concepto_id ASC
  `, params)
  return rows.map((row) => normalizeSnapshotRow(row, 'bridge'))
}

export const readBestStockSnapshots = async (input: { plantel?: unknown; conceptoIds?: number[] } = {}) => {
  try {
    const central = await readCentralSnapshots(input)
    return { source: 'central' as StockSource, snapshots: central }
  } catch (error: any) {
    if (!isMissingStockSchemaError(error)) console.warn('[Conceptos Stock] Stock central no disponible; usando espejo Bridge.', error?.message || error)
    const bridge = await readBridgeSnapshots(input)
    return { source: 'bridge' as StockSource, snapshots: bridge }
  }
}

export const stockMapByConceptId = (snapshots: ConceptoStockSnapshot[]) => {
  const map = new Map<number, ConceptoStockSnapshot>()
  snapshots.forEach((snapshot) => {
    if (snapshot.concepto_id > 0) map.set(snapshot.concepto_id, snapshot)
  })
  return map
}

export const enrichConceptosWithStock = async (conceptos: any[], plantel: unknown) => {
  const ids = Array.from(new Set((conceptos || []).map((row) => Number(row?.id || 0)).filter((id) => id > 0)))
  const stock = await readBestStockSnapshots({ plantel, conceptoIds: ids })
  const byConcept = stockMapByConceptId(stock.snapshots)
  return {
    source: stock.source,
    conceptos: (conceptos || []).map((concepto) => {
      const conceptoId = Number(concepto?.id || 0)
      const snapshot = byConcept.get(conceptoId) || uncontrolledStockSnapshot(conceptoId, plantel, stock.source)
      return { ...concepto, stock: snapshot }
    })
  }
}

export const readStockMovements = async (input: { plantel?: unknown; conceptoId?: unknown; limit?: unknown } = {}) => {
  const plantel = normalizePlantel(input.plantel)
  const conceptoId = Number(input.conceptoId || 0)
  const limit = Math.min(300, Math.max(1, toInt(input.limit, 80)))
  const params: any[] = []
  const where: string[] = ['1 = 1']
  if (plantel) {
    if (!isVisiblePlantel(plantel)) return { source: 'bridge' as StockSource, movements: [] }
    where.push('plantel = ?')
    params.push(plantel)
  } else {
    where.push(visiblePlantelWhere('plantel'))
    params.push(...visiblePlantelParams())
  }
  if (conceptoId > 0) {
    where.push('concepto_id = ?')
    params.push(conceptoId)
  }
  params.push(limit)
  try {
    const rows = await controlEscolarCentralQuery<any[]>(`
      SELECT id, concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id,
             documento, folio, matricula, note, created_at, created_by
      FROM concepto_stock_movements
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?
    `, params)
    return { source: 'central' as StockSource, movements: rows }
  } catch (error) {
    if (!(await localStockSchemaAvailable())) return { source: 'bridge' as StockSource, movements: [] }
    const rows = await query<any[]>(`
      SELECT id, concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id,
             documento, folio, matricula, note, created_at, created_by
      FROM concepto_stock_movements
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?
    `, params)
    return { source: 'bridge' as StockSource, movements: rows }
  }
}

export const syncCentralConceptosStockToBridge = async () => {
  await ensureCentralStockSchema()
  const settings = await controlEscolarCentralQuery<any[]>(`
    SELECT concepto_id, plantel, stock_enabled, unit_label, reorder_point, allow_negative, activo,
           sync_version, updated_by, created_at, updated_at
    FROM concepto_stock_settings
  `)
  const balances = await controlEscolarCentralQuery<any[]>(`
    SELECT concepto_id, plantel, on_hand, reserved, last_movement_id, updated_at
    FROM concepto_stock_balances
  `)
  const movements = await controlEscolarCentralQuery<any[]>(`
    SELECT id, concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id,
           documento, folio, matricula, note, idempotency_key, created_at, created_by
    FROM concepto_stock_movements
    ORDER BY id DESC
    LIMIT 2000
  `)

  const statements: SqlStatement[] = [
    { sql: 'DELETE FROM concepto_stock_movements' },
    { sql: 'DELETE FROM concepto_stock_balances' },
    { sql: 'DELETE FROM concepto_stock_settings' }
  ]

  for (const row of settings) {
    statements.push({
      sql: `INSERT INTO concepto_stock_settings
        (concepto_id, plantel, stock_enabled, unit_label, reorder_point, allow_negative, activo, sync_version, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [row.concepto_id, normalizePlantel(row.plantel), Number(row.stock_enabled || 0), row.unit_label || DEFAULT_UNIT_LABEL, Number(row.reorder_point || 0), Number(row.allow_negative || 0), Number(row.activo ?? 1), Number(row.sync_version || 1), row.updated_by || null, row.created_at || null, row.updated_at || null]
    })
  }

  for (const row of balances) {
    statements.push({
      sql: `INSERT INTO concepto_stock_balances
        (concepto_id, plantel, on_hand, reserved, last_movement_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      params: [row.concepto_id, normalizePlantel(row.plantel), Number(row.on_hand || 0), Number(row.reserved || 0), row.last_movement_id || null, row.updated_at || null]
    })
  }

  for (const row of movements.reverse()) {
    statements.push({
      sql: `INSERT INTO concepto_stock_movements
        (id, concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, documento, folio, matricula, note, idempotency_key, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [row.id, row.concepto_id, normalizePlantel(row.plantel), row.movement_type, Number(row.quantity_delta || 0), Number(row.quantity_after || 0), row.source_type || null, row.source_id || null, row.documento || null, row.folio || null, row.matricula || null, row.note || null, row.idempotency_key || null, row.created_at || null, row.created_by || null]
    })
  }

  await executeStatementTransaction(statements)
  return { ok: true, settings: settings.length, balances: balances.length, movements: movements.length }
}

export const syncCentralConceptosStockToBridgeBestEffort = async () => {
  try {
    return await syncCentralConceptosStockToBridge()
  } catch (error: any) {
    console.warn('[Conceptos Stock] Sync de stock central -> bridge omitido:', error?.message || error)
    return { ok: false, skipped: true, reason: 'bridge_sync_unavailable', message: error?.message || 'No se pudo sincronizar stock.' }
  }
}

export const canManageConceptosStock = (user: AuthSessionUser) => {
  if (user.isSuperAdmin) return true
  return user.roles.some((role) => ['admin', 'role_admin', 'conceptos_admin', 'role_conceptos', 'stock_admin', 'role_stock'].includes(String(role || '').toLowerCase()))
}

export const requireConceptosStockAdmin = async (event: any) => {
  const user = await getTrustedAuthUser(event)
  if (!canManageConceptosStock(user)) {
    throw createError({ statusCode: 403, message: 'No tienes permisos para administrar stock.' })
  }
  return user
}

export const saveStockSettings = async (input: any, user: AuthSessionUser) => {
  await ensureCentralStockSchema()
  const conceptoId = Number(input?.concepto_id || input?.conceptoId || 0)
  const plantel = normalizePlantel(input?.plantel)
  if (!conceptoId || !plantel) throw createError({ statusCode: 400, message: 'Concepto y plantel requeridos.' })
  if (!isVisiblePlantel(plantel)) throw createError({ statusCode: 400, message: 'Plantel no disponible para conceptos.' })

  const enabled = isTruthy(input?.stock_enabled ?? input?.enabled)
  const reorderPoint = Math.max(0, toInt(input?.reorder_point ?? input?.reorderPoint, 0))
  const allowNegative = isTruthy(input?.allow_negative ?? input?.allowNegative)
  const unitLabel = normalizeText(input?.unit_label || input?.unitLabel || DEFAULT_UNIT_LABEL, 40) || DEFAULT_UNIT_LABEL
  const syncVersion = Date.now()

  await controlEscolarCentralQuery(`
    INSERT INTO concepto_stock_settings
      (concepto_id, plantel, stock_enabled, unit_label, reorder_point, allow_negative, activo, sync_version, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON DUPLICATE KEY UPDATE
      stock_enabled = VALUES(stock_enabled),
      unit_label = VALUES(unit_label),
      reorder_point = VALUES(reorder_point),
      allow_negative = VALUES(allow_negative),
      activo = 1,
      sync_version = VALUES(sync_version),
      updated_by = VALUES(updated_by)
  `, [conceptoId, plantel, enabled ? 1 : 0, unitLabel, reorderPoint, allowNegative ? 1 : 0, syncVersion, user.email])

  await controlEscolarCentralQuery(`
    INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved)
    VALUES (?, ?, 0, 0)
  `, [conceptoId, plantel])

  const synced = await syncCentralConceptosStockToBridgeBestEffort()
  const snapshot = (await readCentralSnapshots({ plantel, conceptoIds: [conceptoId] }))[0] || uncontrolledStockSnapshot(conceptoId, plantel, 'central')
  return { ok: true, snapshot, synced }
}

const stockMutation = async (input: any, user: AuthSessionUser, type: 'restock' | 'adjustment') => {
  await ensureCentralStockSchema()
  const conceptoId = Number(input?.concepto_id || input?.conceptoId || 0)
  const plantel = normalizePlantel(input?.plantel)
  const rawQuantity = Number(input?.quantity ?? input?.cantidad ?? 0)
  const quantity = type === 'adjustment' ? Math.trunc(rawQuantity) : Math.max(1, Math.trunc(rawQuantity))
  const note = normalizeText(input?.note || input?.motivo || '', 1200) || null

  if (!conceptoId || !plantel) throw createError({ statusCode: 400, message: 'Concepto y plantel requeridos.' })
  if (!isVisiblePlantel(plantel)) throw createError({ statusCode: 400, message: 'Plantel no disponible para conceptos.' })
  if (!Number.isFinite(quantity) || quantity === 0) throw createError({ statusCode: 400, message: 'Cantidad inválida.' })

  const db = getControlEscolarCentralDb()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [settingsRows] = await conn.query<any[]>(`
      SELECT stock_enabled
      FROM concepto_stock_settings
      WHERE concepto_id = ? AND plantel = ? AND IFNULL(activo, 1) = 1
      FOR UPDATE
    `, [conceptoId, plantel])
    let setting = settingsRows[0]
    if ((!setting || Number(setting.stock_enabled || 0) === 0) && type === 'restock') {
      await conn.query(`
        INSERT INTO concepto_stock_settings
          (concepto_id, plantel, stock_enabled, unit_label, reorder_point, allow_negative, activo, sync_version, updated_by)
        VALUES (?, ?, 1, ?, 0, 0, 1, ?, ?)
        ON DUPLICATE KEY UPDATE
          stock_enabled = 1,
          activo = 1,
          sync_version = VALUES(sync_version),
          updated_by = VALUES(updated_by)
      `, [conceptoId, plantel, DEFAULT_UNIT_LABEL, Date.now(), user.email])
      setting = { stock_enabled: 1 }
    }
    if (!setting || Number(setting.stock_enabled || 0) === 0) {
      throw createError({ statusCode: 409, message: 'Primero agrega existencia para este plantel.' })
    }

    await conn.query(`INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved) VALUES (?, ?, 0, 0)`, [conceptoId, plantel])
    const [balanceRows] = await conn.query<any[]>(`
      SELECT on_hand, reserved
      FROM concepto_stock_balances
      WHERE concepto_id = ? AND plantel = ?
      FOR UPDATE
    `, [conceptoId, plantel])
    const current = Number(balanceRows[0]?.on_hand || 0)
    const next = current + quantity
    if (next < 0) throw createError({ statusCode: 409, message: 'El ajuste dejaría stock negativo.' })

    await conn.query(`
      UPDATE concepto_stock_balances
      SET on_hand = ?, updated_at = CURRENT_TIMESTAMP
      WHERE concepto_id = ? AND plantel = ?
    `, [next, conceptoId, plantel])
    const [movementResult] = await conn.query<any>(`
      INSERT INTO concepto_stock_movements
        (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, note, idempotency_key, created_by)
      VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)
    `, [conceptoId, plantel, type, quantity, next, note, `manual:${type}:${conceptoId}:${plantel}:${Date.now()}`, user.email])
    await conn.query(`
      UPDATE concepto_stock_balances
      SET last_movement_id = ?
      WHERE concepto_id = ? AND plantel = ?
    `, [Number(movementResult?.insertId || 0) || null, conceptoId, plantel])
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  const synced = await syncCentralConceptosStockToBridgeBestEffort()
  const snapshot = (await readCentralSnapshots({ plantel, conceptoIds: [conceptoId] }))[0]
  return { ok: true, snapshot, synced }
}

export const restockConceptoStock = async (input: any, user: AuthSessionUser) => stockMutation(input, user, 'restock')
export const adjustConceptoStock = async (input: any, user: AuthSessionUser) => stockMutation(input, user, 'adjustment')

export const assertStockAvailableForConcept = async (input: { conceptoId: unknown; plantel: unknown; quantity?: unknown; operation?: string }) => {
  const conceptoId = Number(input.conceptoId || 0)
  const plantel = normalizePlantel(input.plantel)
  const quantity = toPositiveInt(input.quantity, 1)
  if (!conceptoId || !plantel || !isVisiblePlantel(plantel)) return uncontrolledStockSnapshot(conceptoId, plantel)
  const { snapshots, source } = await readBestStockSnapshots({ plantel, conceptoIds: [conceptoId] })
  const snapshot = snapshots[0] || uncontrolledStockSnapshot(conceptoId, plantel, source)
  if (!snapshot.controlled) return snapshot
  if (!snapshot.allow_negative && Number(snapshot.available || 0) < quantity) {
    throw createError({ statusCode: 409, message: `Stock insuficiente para ${input.operation || 'operar este concepto'}. Disponible: ${Number(snapshot.available || 0)}.` })
  }
  return snapshot
}

const reserveCentral = async (input: any): Promise<StockReservation> => {
  const conceptoId = Number(input.conceptoId || 0)
  const plantel = normalizePlantel(input.plantel)
  const quantity = toPositiveInt(input.quantity, 1)
  const idempotencyKey = normalizeText(input.idempotencyKey, 160)
  const db = getControlEscolarCentralDb()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [settingsRows] = await conn.query<any[]>(`
      SELECT stock_enabled, allow_negative, reorder_point
      FROM concepto_stock_settings
      WHERE concepto_id = ? AND plantel = ? AND IFNULL(activo, 1) = 1
      FOR UPDATE
    `, [conceptoId, plantel])
    const setting = settingsRows[0]
    if (!setting || Number(setting.stock_enabled || 0) === 0) {
      await conn.rollback()
      return { controlled: false, source: 'central', concepto_id: conceptoId, plantel, quantity: 0 }
    }

    await conn.query(`INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved) VALUES (?, ?, 0, 0)`, [conceptoId, plantel])
    const [balanceRows] = await conn.query<any[]>(`
      SELECT on_hand, reserved
      FROM concepto_stock_balances
      WHERE concepto_id = ? AND plantel = ?
      FOR UPDATE
    `, [conceptoId, plantel])
    const current = Number(balanceRows[0]?.on_hand || 0)
    const reserved = Number(balanceRows[0]?.reserved || 0)
    const available = current - reserved
    if (Number(setting.allow_negative || 0) === 0 && available < quantity) {
      throw createError({ statusCode: 409, message: `Stock insuficiente. Disponible: ${Math.max(0, available)}.` })
    }

    const next = current - quantity
    await conn.query(`
      UPDATE concepto_stock_balances
      SET on_hand = ?, updated_at = CURRENT_TIMESTAMP
      WHERE concepto_id = ? AND plantel = ?
    `, [next, conceptoId, plantel])
    const [movementResult] = await conn.query<any>(`
      INSERT INTO concepto_stock_movements
        (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, documento, matricula, note, idempotency_key, created_by)
      VALUES (?, ?, 'payment_consume', ?, ?, 'payment', ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
    `, [conceptoId, plantel, -quantity, next, idempotencyKey, input.documento || null, input.matricula || null, input.note || null, idempotencyKey, input.userEmail || null])
    const movementId = Number(movementResult?.insertId || 0) || null
    await conn.query(`UPDATE concepto_stock_balances SET last_movement_id = ? WHERE concepto_id = ? AND plantel = ?`, [movementId, conceptoId, plantel])
    await conn.commit()
    return { controlled: true, source: 'central', concepto_id: conceptoId, plantel, quantity, movement_id: movementId, idempotency_key: idempotencyKey }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

const reserveBridge = async (input: any): Promise<StockReservation> => {
  const conceptoId = Number(input.conceptoId || 0)
  const plantel = normalizePlantel(input.plantel)
  const quantity = toPositiveInt(input.quantity, 1)
  const idempotencyKey = normalizeText(input.idempotencyKey, 160)
  const [setting] = await query<any[]>(`
    SELECT stock_enabled, allow_negative
    FROM concepto_stock_settings
    WHERE concepto_id = ? AND plantel = ? AND IFNULL(activo, 1) = 1
    LIMIT 1
  `, [conceptoId, plantel])
  if (!setting || Number(setting.stock_enabled || 0) === 0) return { controlled: false, source: 'bridge', concepto_id: conceptoId, plantel, quantity: 0 }

  await query(`INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved) VALUES (?, ?, 0, 0)`, [conceptoId, plantel])
  const [balance] = await query<any[]>(`SELECT on_hand, reserved FROM concepto_stock_balances WHERE concepto_id = ? AND plantel = ? LIMIT 1`, [conceptoId, plantel])
  const current = Number(balance?.on_hand || 0)
  const reserved = Number(balance?.reserved || 0)
  const available = current - reserved
  if (Number(setting.allow_negative || 0) === 0 && available < quantity) {
    throw createError({ statusCode: 409, message: `Stock insuficiente. Disponible: ${Math.max(0, available)}.` })
  }
  const next = current - quantity
  const results = await executeStatementTransaction<any>([
    { sql: `UPDATE concepto_stock_balances SET on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE concepto_id = ? AND plantel = ?`, params: [next, conceptoId, plantel] },
    {
      sql: `INSERT INTO concepto_stock_movements
        (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, documento, matricula, note, idempotency_key, created_by)
        VALUES (?, ?, 'payment_consume', ?, ?, 'payment', ?, ?, ?, ?, ?, ?)`,
      params: [conceptoId, plantel, -quantity, next, idempotencyKey, input.documento || null, input.matricula || null, input.note || null, idempotencyKey, input.userEmail || null]
    }
  ])
  const movementId = Number(results[1]?.insertId || 0) || null
  return { controlled: true, source: 'bridge', concepto_id: conceptoId, plantel, quantity, movement_id: movementId, idempotency_key: idempotencyKey }
}

export const reserveStockForPayment = async (input: any): Promise<StockReservation> => {
  const conceptoId = Number(input?.conceptoId || 0)
  const plantel = normalizePlantel(input?.plantel)
  if (!conceptoId || !plantel || !isVisiblePlantel(plantel)) return { controlled: false, source: 'bridge', concepto_id: conceptoId, plantel, quantity: 0 }
  try {
    return await reserveCentral(input)
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.status || 0)
    if (statusCode >= 400 && statusCode < 500) throw error
    if (!isMissingStockSchemaError(error)) console.warn('[Conceptos Stock] Reserva central no disponible; usando bridge.', error?.message || error)
    if (!(await localStockSchemaAvailable())) {
      if (isMissingStockSchemaError(error)) return { controlled: false, source: 'bridge', concepto_id: conceptoId, plantel, quantity: 0 }
      throw error
    }
    return await reserveBridge(input)
  }
}

const releaseCentral = async (reservation: StockReservation, reason: string) => {
  if (!reservation.controlled || !reservation.quantity || !reservation.idempotency_key) return
  const db = getControlEscolarCentralDb()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [balanceRows] = await conn.query<any[]>(`SELECT on_hand FROM concepto_stock_balances WHERE concepto_id = ? AND plantel = ? FOR UPDATE`, [reservation.concepto_id, reservation.plantel])
    const next = Number(balanceRows[0]?.on_hand || 0) + reservation.quantity
    await conn.query(`UPDATE concepto_stock_balances SET on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE concepto_id = ? AND plantel = ?`, [next, reservation.concepto_id, reservation.plantel])
    await conn.query(`INSERT IGNORE INTO concepto_stock_movements
      (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, note, idempotency_key, created_by)
      VALUES (?, ?, 'payment_release', ?, ?, 'payment', ?, ?, ?, 'system')`,
      [reservation.concepto_id, reservation.plantel, reservation.quantity, next, reservation.idempotency_key, reason, `release:${reservation.idempotency_key}`])
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

const releaseBridge = async (reservation: StockReservation, reason: string) => {
  if (!reservation.controlled || !reservation.quantity || !reservation.idempotency_key) return
  await query(`INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved) VALUES (?, ?, 0, 0)`, [reservation.concepto_id, reservation.plantel])
  const [balance] = await query<any[]>(`SELECT on_hand FROM concepto_stock_balances WHERE concepto_id = ? AND plantel = ? LIMIT 1`, [reservation.concepto_id, reservation.plantel])
  const next = Number(balance?.on_hand || 0) + reservation.quantity
  await executeStatementTransaction([
    { sql: `UPDATE concepto_stock_balances SET on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE concepto_id = ? AND plantel = ?`, params: [next, reservation.concepto_id, reservation.plantel] },
    { sql: `INSERT IGNORE INTO concepto_stock_movements
      (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, note, idempotency_key, created_by)
      VALUES (?, ?, 'payment_release', ?, ?, 'payment', ?, ?, ?, 'system')`,
      params: [reservation.concepto_id, reservation.plantel, reservation.quantity, next, reservation.idempotency_key, reason, `release:${reservation.idempotency_key}`] }
  ])
}

export const releaseStockReservation = async (reservation: StockReservation, reason = 'Pago no confirmado') => {
  if (!reservation.controlled) return
  try {
    if (reservation.source === 'central') await releaseCentral(reservation, reason)
    else await releaseBridge(reservation, reason)
  } catch (error) {
    console.error('[Conceptos Stock] No se pudo liberar reserva de stock:', error)
  }
}

export const finalizeStockReservation = async (reservation: StockReservation, folio: number) => {
  if (!reservation.controlled || !folio || !reservation.movement_id) return
  const sql = `UPDATE concepto_stock_movements SET folio = ?, source_id = ? WHERE id = ?`
  try {
    if (reservation.source === 'central') {
      await controlEscolarCentralQuery(sql, [folio, String(folio), reservation.movement_id])
      syncCentralConceptosStockToBridgeBestEffort().catch(() => {})
    } else {
      await query(sql, [folio, String(folio), reservation.movement_id])
    }
  } catch (error) {
    console.warn('[Conceptos Stock] No se pudo finalizar movimiento de stock:', error)
  }
}

export const restoreStockForCanceledPayment = async (pago: any, user: AuthSessionUser) => {
  const stockControlled = Number(pago?.stock_controlled || 0) === 1
  const conceptoId = Number(pago?.stock_concepto_id || pago?.concepto || 0)
  const plantel = normalizePlantel(pago?.stock_plantel || pago?.plantel)
  const quantity = toPositiveInt(pago?.stock_quantity, 1)
  if (!stockControlled || !conceptoId || !plantel || !isVisiblePlantel(plantel)) return { restored: false }

  const idempotencyKey = `cancel:${pago.folio}:${conceptoId}:${plantel}`
  const applyCentral = async () => {
    await ensureCentralStockSchema()
    const db = getControlEscolarCentralDb()
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(`INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved) VALUES (?, ?, 0, 0)`, [conceptoId, plantel])
      const [balanceRows] = await conn.query<any[]>(`SELECT on_hand FROM concepto_stock_balances WHERE concepto_id = ? AND plantel = ? FOR UPDATE`, [conceptoId, plantel])
      const next = Number(balanceRows[0]?.on_hand || 0) + quantity
      await conn.query(`UPDATE concepto_stock_balances SET on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE concepto_id = ? AND plantel = ?`, [next, conceptoId, plantel])
      const [movementResult] = await conn.query<any>(`INSERT INTO concepto_stock_movements
        (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, documento, folio, matricula, note, idempotency_key, created_by)
        VALUES (?, ?, 'payment_cancel_restore', ?, ?, 'payment_cancel', ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [conceptoId, plantel, quantity, next, String(pago.folio), pago.documento || null, pago.folio || null, pago.matricula || null, 'Cancelación de pago', idempotencyKey, user.email || user.name || 'Sistema'])
      await conn.query(`UPDATE concepto_stock_balances SET last_movement_id = ? WHERE concepto_id = ? AND plantel = ?`, [Number(movementResult?.insertId || 0) || null, conceptoId, plantel])
      await conn.commit()
      return { restored: true, source: 'central' as StockSource }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  try {
    const result = await applyCentral()
    syncCentralConceptosStockToBridgeBestEffort().catch(() => {})
    return result
  } catch (error: any) {
    if (!(await localStockSchemaAvailable())) throw error
    await query(`INSERT IGNORE INTO concepto_stock_balances (concepto_id, plantel, on_hand, reserved) VALUES (?, ?, 0, 0)`, [conceptoId, plantel])
    const [balance] = await query<any[]>(`SELECT on_hand FROM concepto_stock_balances WHERE concepto_id = ? AND plantel = ? LIMIT 1`, [conceptoId, plantel])
    const next = Number(balance?.on_hand || 0) + quantity
    await executeStatementTransaction([
      { sql: `UPDATE concepto_stock_balances SET on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE concepto_id = ? AND plantel = ?`, params: [next, conceptoId, plantel] },
      { sql: `INSERT IGNORE INTO concepto_stock_movements
        (concepto_id, plantel, movement_type, quantity_delta, quantity_after, source_type, source_id, documento, folio, matricula, note, idempotency_key, created_by)
        VALUES (?, ?, 'payment_cancel_restore', ?, ?, 'payment_cancel', ?, ?, ?, ?, ?, ?, ?)`,
        params: [conceptoId, plantel, quantity, next, String(pago.folio), pago.documento || null, pago.folio || null, pago.matricula || null, 'Cancelación de pago', idempotencyKey, user.email || user.name || 'Sistema'] }
    ])
    return { restored: true, source: 'bridge' as StockSource }
  }
}
