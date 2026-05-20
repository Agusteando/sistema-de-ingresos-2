import mysql from 'mysql2/promise'

type RuntimeControlEscolarDbConfig = {
  controlEscolarMysqlHost?: string
  controlEscolarMysqlPort?: string | number
  controlEscolarMysqlUser?: string
  controlEscolarMysqlPassword?: string
  controlEscolarMysqlDatabase?: string
  controlEscolarMysqlConnectionLimit?: string | number
}

type SqlParams = any[] | Record<string, any>

let controlEscolarPool: mysql.Pool | null = null

const getConfig = () => useRuntimeConfig() as unknown as RuntimeControlEscolarDbConfig

const requiredValue = (value: unknown, name: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) {
    throw createError({
      statusCode: 500,
      message: `Falta configurar ${name}. Control Escolar necesita una conexión MySQL centralizada para la tabla matricula.`
    })
  }
  return normalized
}

export const getControlEscolarCentralDb = () => {
  if (!controlEscolarPool) {
    const config = getConfig()
    controlEscolarPool = mysql.createPool({
      host: requiredValue(config.controlEscolarMysqlHost, 'CONTROL_ESCOLAR_MYSQL_HOST'),
      port: Number(config.controlEscolarMysqlPort || 3306),
      user: requiredValue(config.controlEscolarMysqlUser, 'CONTROL_ESCOLAR_MYSQL_USER'),
      password: String(config.controlEscolarMysqlPassword || ''),
      database: requiredValue(config.controlEscolarMysqlDatabase, 'CONTROL_ESCOLAR_MYSQL_DATABASE'),
      waitForConnections: true,
      connectionLimit: Math.max(1, Number(config.controlEscolarMysqlConnectionLimit || 10) || 10),
      queueLimit: 0,
      charset: 'utf8mb4'
    })
  }

  return controlEscolarPool
}

export const controlEscolarCentralQuery = async <T>(sql: string, params?: SqlParams): Promise<T> => {
  const db = getControlEscolarCentralDb()
  const [rows] = await db.query(sql, params as never)
  return rows as T
}
