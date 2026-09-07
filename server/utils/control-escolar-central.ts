import mysql from 'mysql2/promise'

type RuntimeCentralDbConfig = {
  controlEscolarMysqlHost?: string
  controlEscolarMysqlPort?: string | number
  controlEscolarMysqlUser?: string
  controlEscolarMysqlPassword?: string
  controlEscolarMysqlDatabase?: string
  controlEscolarMysqlConnectionLimit?: string | number
}

type SqlParams = any[] | Record<string, any>

type TableColumn = {
  Field: string
  Type?: string
  Null?: string
  Key?: string
  Default?: any
  Extra?: string
}

const MAX_READ_ATTEMPTS = 3
const READ_RETRY_DELAYS_MS = [75, 200]
const TRANSIENT_MYSQL_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'PROTOCOL_ENQUEUE_AFTER_END',
  'PROTOCOL_PACKETS_OUT_OF_ORDER',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ERR_STREAM_WRITE_AFTER_END',
  'ER_CON_COUNT_ERROR',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT'
])

let controlEscolarPool: mysql.Pool | null = null
let configuredConnectionLimit = 10
const centralColumnCache = new Map<string, { columns: Set<string>; loadedAt: number }>()
const CENTRAL_SCHEMA_CACHE_MS = 1000 * 60 * 5

const getConfig = () => useRuntimeConfig() as unknown as RuntimeCentralDbConfig

const runtimeValue = (envName: string, configValue: unknown) => {
  const envValue = process.env[envName]
  return envValue === undefined ? configValue : envValue
}

const requiredValue = (value: unknown, name: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) {
    throw createError({
      statusCode: 500,
      message: `Falta configurar ${name}. La app necesita la base MySQL centralizada para usuarios y para la tabla matricula.`
    })
  }
  return normalized
}

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``

const stripLeadingSqlComments = (sql: string) => {
  let statement = String(sql || '')
  while (true) {
    const next = statement.replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:#[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))\s*/, '')
    if (next === statement) return statement.trimStart()
    statement = next
  }
}

const statementOperation = (sql: string) => String(stripLeadingSqlComments(sql).match(/^([A-Za-z]+)/)?.[1] || 'UNKNOWN').toUpperCase()
const isReadOnlyStatement = (sql: string) => /^(?:SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(stripLeadingSqlComments(sql))

const isTransientMysqlError = (error: any) => {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase()
  if (TRANSIENT_MYSQL_CODES.has(code)) return true
  const message = String(error?.message || '').toLowerCase()
  return /connection.*(?:lost|closed|reset|refused)|socket.*(?:closed|hang up)|write after end|pool is closed|closed state|timed?\s*out|too many connections/.test(message)
}

const waitBeforeRetry = async (attempt: number) => {
  const delay = READ_RETRY_DELAYS_MS[Math.min(attempt, READ_RETRY_DELAYS_MS.length - 1)] || 100
  await new Promise((resolve) => setTimeout(resolve, delay))
}

const assertCentralStatementIsDataOnly = (sql: string) => {
  const statement = stripLeadingSqlComments(sql)
  if (!/^(?:CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(statement)) return

  const error: any = new Error(
    'Las modificaciones de esquema en CONTROL_ESCOLAR_MYSQL_DATABASE deben ejecutarse manualmente fuera de la aplicación.'
  )
  error.code = 'CENTRAL_DB_SCHEMA_MUTATION_BLOCKED'
  throw error
}

export const getControlEscolarCentralDb = () => {
  if (!controlEscolarPool) {
    const config = getConfig()
    const host = requiredValue(runtimeValue('CONTROL_ESCOLAR_MYSQL_HOST', config.controlEscolarMysqlHost), 'CONTROL_ESCOLAR_MYSQL_HOST')
    const port = Number(runtimeValue('CONTROL_ESCOLAR_MYSQL_PORT', config.controlEscolarMysqlPort) || 3306)
    const user = requiredValue(runtimeValue('CONTROL_ESCOLAR_MYSQL_USER', config.controlEscolarMysqlUser), 'CONTROL_ESCOLAR_MYSQL_USER')
    const password = String(runtimeValue('CONTROL_ESCOLAR_MYSQL_PASSWORD', config.controlEscolarMysqlPassword) || '')
    const database = requiredValue(runtimeValue('CONTROL_ESCOLAR_MYSQL_DATABASE', config.controlEscolarMysqlDatabase), 'CONTROL_ESCOLAR_MYSQL_DATABASE')
    const connectionLimit = Math.max(
      1,
      Number(runtimeValue('CONTROL_ESCOLAR_MYSQL_CONNECTION_LIMIT', config.controlEscolarMysqlConnectionLimit) || 30) || 30
    )
    configuredConnectionLimit = connectionLimit

    controlEscolarPool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit,
      maxIdle: connectionLimit,
      idleTimeout: 10 * 60 * 1000,
      queueLimit: 0,
      charset: 'utf8mb4',
      connectTimeout: 10_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    })

    console.info('[control-escolar-central] MySQL pool ready', {
      host,
      port,
      database,
      connectionLimit
    })
  }

  return controlEscolarPool
}

export const controlEscolarCentralQuery = async <T>(sql: string, params?: SqlParams): Promise<T> => {
  assertCentralStatementIsDataOnly(sql)
  const db = getControlEscolarCentralDb()
  const readOnly = isReadOnlyStatement(sql)
  const maxAttempts = readOnly ? MAX_READ_ATTEMPTS : 1
  const operation = statementOperation(sql)
  let lastError: any = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const startedAt = Date.now()
    try {
      const [rows] = await db.query(sql, params as never)
      const durationMs = Date.now() - startedAt
      if (durationMs >= 1000) {
        console.warn('[control-escolar-central] slow query', {
          operation,
          durationMs,
          attempt: attempt + 1
        })
      }
      return rows as T
    } catch (error: any) {
      lastError = error
      const durationMs = Date.now() - startedAt
      const retryable = readOnly && isTransientMysqlError(error) && attempt < maxAttempts - 1
      console.warn('[control-escolar-central] query failed', {
        operation,
        code: String(error?.code || ''),
        durationMs,
        attempt: attempt + 1,
        retryable
      })
      if (!retryable) throw error
      await waitBeforeRetry(attempt)
    }
  }

  throw lastError
}

export const warmControlEscolarCentralDb = async (targetConnections = 6) => {
  const db = getControlEscolarCentralDb()
  const count = Math.max(1, Math.min(configuredConnectionLimit, Number(targetConnections || 1)))
  const connections: mysql.PoolConnection[] = []

  try {
    for (let index = 0; index < count; index += 1) {
      connections.push(await db.getConnection())
    }
    await Promise.all(connections.map((connection) => connection.query('SELECT 1')))
    return { connections: connections.length }
  } finally {
    connections.forEach((connection) => connection.release())
  }
}

export const withControlEscolarCentralConnection = async <T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> => {
  const connection = await getControlEscolarCentralDb().getConnection()
  try {
    return await callback(connection)
  } finally {
    connection.release()
  }
}

export const getCentralTableColumns = async (tableName: string) => {
  const normalized = String(tableName || '').trim()
  if (!normalized) return new Set<string>()

  const cached = centralColumnCache.get(normalized)
  if (cached && Date.now() - cached.loadedAt < CENTRAL_SCHEMA_CACHE_MS) return cached.columns

  const rows = await controlEscolarCentralQuery<TableColumn[]>(`SHOW COLUMNS FROM ${escapeIdentifier(normalized)}`)
  const columns = new Set(rows.map((row) => row.Field))
  centralColumnCache.set(normalized, { columns, loadedAt: Date.now() })
  return columns
}

export const centralTableHasColumn = async (tableName: string, column: string) => {
  const columns = await getCentralTableColumns(tableName)
  return columns.has(column)
}
