import { randomUUID } from 'node:crypto'
import { controlEscolarCentralQuery } from './control-escolar-central'

const CONTRACTS_TABLE = 'talleres_student_contracts'
const HISTORY_TABLE = 'talleres_assignment_history'
const cleanMatricula = (value: unknown) => String(value || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 64)
const clean = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const truthy = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(value ?? '').trim().toLowerCase()) || Number(value) === 1

let schemaCache = { checkedAt: 0, contracts: false, history: false }
const SCHEMA_CACHE_MS = 60_000

const readSchema = async () => {
  if (schemaCache.checkedAt && Date.now() - schemaCache.checkedAt < SCHEMA_CACHE_MS) return schemaCache
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?)`, [CONTRACTS_TABLE, HISTORY_TABLE],
  )
  const names = new Set(rows.map((row) => String(row.TABLE_NAME || row.table_name || '')))
  schemaCache = { checkedAt: Date.now(), contracts: names.has(CONTRACTS_TABLE), history: names.has(HISTORY_TABLE) }
  return schemaCache
}

export const readTalleresContracts = async (matriculas: unknown[]) => {
  const schema = await readSchema()
  const result = new Map<string, { hasContract: boolean | null, observations: string, updatedAt: string | null }>()
  if (!schema.contracts) return { ready: false, result }
  const unique = Array.from(new Set(matriculas.map(cleanMatricula).filter(Boolean)))
  for (let offset = 0; offset < unique.length; offset += 250) {
    const chunk = unique.slice(offset, offset + 250)
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT matricula, has_contract, observations, updated_at
         FROM ${CONTRACTS_TABLE} WHERE matricula IN (${chunk.map(() => '?').join(',')})`, chunk,
    )
    for (const row of rows) {
      result.set(cleanMatricula(row.matricula), {
        hasContract: row.has_contract == null ? null : truthy(row.has_contract),
        observations: clean(row.observations, 2000),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      })
    }
  }
  return { ready: true, result }
}

export const readTalleresContract = async (matricula: unknown) => {
  const key = cleanMatricula(matricula)
  if (!key) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  const { ready, result } = await readTalleresContracts([key])
  const value = result.get(key) || { hasContract: null, observations: '', updatedAt: null }
  return { ready, matricula: key, ...value }
}

export const saveTalleresContract = async ({ matricula, hasContract, observations, updatedBy }: {
  matricula: unknown
  hasContract: unknown
  observations?: unknown
  updatedBy?: unknown
}) => {
  const key = cleanMatricula(matricula)
  if (!key) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  const schema = await readSchema()
  if (!schema.contracts) throw createError({ statusCode: 503, message: `Falta la tabla ${CONTRACTS_TABLE}. Ejecuta primero la migración de Talleres.` })
  const contractValue = hasContract == null || hasContract === '' ? null : (truthy(hasContract) ? 1 : 0)
  const notes = clean(observations, 2000)
  const actor = clean(updatedBy, 255) || 'sistema'
  await controlEscolarCentralQuery(
    `INSERT INTO ${CONTRACTS_TABLE} (matricula, has_contract, observations, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE has_contract = VALUES(has_contract), observations = VALUES(observations), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
    [key, contractValue, notes || null, actor],
  )
  if (schema.history) {
    await controlEscolarCentralQuery(
      `INSERT INTO ${HISTORY_TABLE}
        (id, matricula, plantel_code, workshop_key, workshop_name, action, effective_at, actor_email, metadata_json)
       VALUES (?, ?, 'GLOBAL', 'CONTRATO', 'INFORMACIÓN DE TALLERES', 'contract_updated', CURRENT_TIMESTAMP, ?, ?)`,
      [randomUUID(), key, actor, JSON.stringify({ hasContract: contractValue == null ? null : Boolean(contractValue), observations: notes })],
    )
  }
  return { ok: true, ready: true, matricula: key, hasContract: contractValue == null ? null : Boolean(contractValue), observations: notes, updatedAt: new Date().toISOString() }
}

export const recordTalleresAssignmentChange = async ({ matricula, plantel, workshopKey, workshopName, action, actorEmail, metadata = {} }: {
  matricula: unknown
  plantel: unknown
  workshopKey: unknown
  workshopName: unknown
  action: 'assigned' | 'removed'
  actorEmail?: unknown
  metadata?: Record<string, unknown>
}) => {
  const schema = await readSchema()
  if (!schema.history) return { ready: false }
  await controlEscolarCentralQuery(
    `INSERT INTO ${HISTORY_TABLE}
      (id, matricula, plantel_code, workshop_key, workshop_name, action, effective_at, actor_email, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
    [randomUUID(), cleanMatricula(matricula), clean(plantel, 10).toUpperCase(), clean(workshopKey, 120), clean(workshopName, 180), action, clean(actorEmail, 255) || null, JSON.stringify(metadata)],
  )
  return { ready: true }
}


export const readTalleresAssignmentSummaries = async (matriculas: unknown[]) => {
  const schema = await readSchema()
  const result = new Map<string, Record<string, { workshopName: string, joinedAt: string | null, removedAt: string | null, lastAction: string, lastChangedAt: string | null, actorEmail: string | null }>>()
  if (!schema.history) return { ready: false, result }
  const unique = Array.from(new Set(matriculas.map(cleanMatricula).filter(Boolean)))
  if (!unique.length) return { ready: true, result }
  for (let offset = 0; offset < unique.length; offset += 250) {
    const chunk = unique.slice(offset, offset + 250)
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT matricula, workshop_key, workshop_name, action, effective_at, actor_email
         FROM ${HISTORY_TABLE}
        WHERE matricula IN (${chunk.map(() => '?').join(',')})
          AND action IN ('assigned','removed')
        ORDER BY effective_at ASC`, chunk,
    )
    for (const row of rows) {
      const matricula = cleanMatricula(row.matricula)
      const key = clean(row.workshop_key, 120).toUpperCase()
      if (!matricula || !key) continue
      const byWorkshop = result.get(matricula) || {}
      const current = byWorkshop[key] || { workshopName: clean(row.workshop_name, 180) || key.replace(/_/g, ' '), joinedAt: null, removedAt: null, lastAction: '', lastChangedAt: null, actorEmail: null }
      const at = row.effective_at ? new Date(row.effective_at).toISOString() : null
      if (row.action === 'assigned') {
        current.joinedAt = at || current.joinedAt
        current.removedAt = null
      } else if (row.action === 'removed') {
        current.removedAt = at
      }
      current.workshopName = clean(row.workshop_name, 180) || current.workshopName
      current.lastAction = String(row.action || '')
      current.lastChangedAt = at
      current.actorEmail = clean(row.actor_email, 255) || null
      byWorkshop[key] = current
      result.set(matricula, byWorkshop)
    }
  }
  return { ready: true, result }
}
