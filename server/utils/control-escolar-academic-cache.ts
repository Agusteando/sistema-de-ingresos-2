import crypto from 'node:crypto'
import { controlEscolarCentralQuery, withControlEscolarCentralConnection } from './control-escolar-central'

const ACADEMIC_CACHE_TABLE = 'control_external_academic_cache'
const CACHE_TTL_HOURS = 12
const SCHEMA_CHECK_MS = 1000 * 60 * 5
const LOCK_WAIT_SECONDS = 2

let schemaCheckedAt = 0
let schemaAvailable = false

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

const safeJsonParse = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

const toIsoOrNull = (value: unknown) => {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export type CachedAcademicPlacement = {
  response: any
  freshness: 'fresh' | 'stale'
  generatedAt: string | null
  freshUntil: string | null
}

export const hasControlEscolarAcademicCacheSchema = async () => {
  if (schemaCheckedAt && Date.now() - schemaCheckedAt < SCHEMA_CHECK_MS) return schemaAvailable

  try {
    const rows = await controlEscolarCentralQuery<Array<{ TABLE_NAME?: string; table_name?: string }>>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       LIMIT 1`,
      [ACADEMIC_CACHE_TABLE]
    )
    schemaAvailable = rows.length > 0
  } catch {
    schemaAvailable = false
  }
  schemaCheckedAt = Date.now()
  return schemaAvailable
}

export const readCachedAcademicPlacement = async (
  matriculaValue: unknown,
  cicloValue: unknown
): Promise<CachedAcademicPlacement | null> => {
  const matricula = canonicalMatricula(matriculaValue)
  const ciclo = clean(cicloValue, 20)
  if (!matricula || !ciclo || !(await hasControlEscolarAcademicCacheSchema())) return null

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT payload_json, generated_at, fresh_until
     FROM ${ACADEMIC_CACHE_TABLE}
     WHERE matricula = ? AND ciclo_key = ?
     LIMIT 1`,
    [matricula, ciclo]
  )
  const row = rows[0]
  const response = safeJsonParse(row?.payload_json)
  if (!response?.data?.matricula || !clean(response?.data?.grado, 80)) return null

  const freshUntilTime = row?.fresh_until ? new Date(row.fresh_until).getTime() : 0
  return {
    response,
    freshness: freshUntilTime > Date.now() ? 'fresh' : 'stale',
    generatedAt: toIsoOrNull(row.generated_at),
    freshUntil: toIsoOrNull(row.fresh_until)
  }
}

export const writeCachedAcademicPlacement = async (response: any) => {
  const data = response?.data
  const matricula = canonicalMatricula(data?.matricula)
  const ciclo = clean(data?.ciclo, 20)
  const grado = clean(data?.grado, 80)

  // Only verified positive placements enter the cache. Missing students,
  // incomplete Bridge windows and upstream errors never overwrite a good row.
  if (!matricula || !ciclo || !grado || !(await hasControlEscolarAcademicCacheSchema())) {
    return { written: false, reason: 'non_positive_or_schema_unavailable' }
  }

  const generatedAt = new Date()
  const freshUntil = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000)
  await controlEscolarCentralQuery(
    `INSERT INTO ${ACADEMIC_CACHE_TABLE}
      (matricula, ciclo_key, plantel, nivel, grado, grupo, payload_json, generated_at, fresh_until)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       plantel = VALUES(plantel),
       nivel = VALUES(nivel),
       grado = VALUES(grado),
       grupo = VALUES(grupo),
       payload_json = VALUES(payload_json),
       generated_at = VALUES(generated_at),
       fresh_until = VALUES(fresh_until),
       updated_at = CURRENT_TIMESTAMP`,
    [
      matricula,
      ciclo,
      clean(data?.plantel, 40),
      clean(data?.nivel, 80),
      grado,
      clean(data?.grupo, 80),
      JSON.stringify(response),
      generatedAt,
      freshUntil
    ]
  )

  return { written: true, generatedAt: generatedAt.toISOString(), freshUntil: freshUntil.toISOString() }
}

export const withAcademicCacheRefreshLock = async <T>(
  matriculaValue: unknown,
  cicloValue: unknown,
  callback: () => Promise<T>
): Promise<{ acquired: boolean; value?: T }> => {
  if (!(await hasControlEscolarAcademicCacheSchema())) {
    return { acquired: true, value: await callback() }
  }

  const lockKey = `aurora:academic:${crypto
    .createHash('sha256')
    .update(`${canonicalMatricula(matriculaValue)}:${clean(cicloValue, 20)}`)
    .digest('hex')
    .slice(0, 40)}`

  return await withControlEscolarCentralConnection(async (connection) => {
    const [rows] = await connection.query<any[]>('SELECT GET_LOCK(?, ?) AS acquired', [lockKey, LOCK_WAIT_SECONDS])
    const acquired = Number(rows?.[0]?.acquired || 0) === 1
    if (!acquired) return { acquired: false }

    try {
      return { acquired: true, value: await callback() }
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockKey]).catch(() => {})
    }
  })
}

export const academicCacheMeta = (cached: CachedAcademicPlacement, fallback = false) => ({
  status: cached.freshness,
  shared: true,
  ttlHours: CACHE_TTL_HOURS,
  positiveOnly: true,
  fallback,
  generatedAt: cached.generatedAt,
  freshUntil: cached.freshUntil
})
