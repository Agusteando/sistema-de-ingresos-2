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

let controlEscolarPool: mysql.Pool | null = null
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
      Number(runtimeValue('CONTROL_ESCOLAR_MYSQL_CONNECTION_LIMIT', config.controlEscolarMysqlConnectionLimit) || 10) || 10
    )

    controlEscolarPool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit,
      queueLimit: 0,
      charset: 'utf8mb4'
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
  const [rows] = await db.query(sql, params as never)
  return rows as T
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
