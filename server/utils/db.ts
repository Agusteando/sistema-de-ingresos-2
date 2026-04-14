import mysql from 'mysql2/promise'

let pool: mysql.Pool

export const getDb = () => {
  if (!pool) {
    const config = useRuntimeConfig()
    pool = mysql.createPool({
      host: config.mysqlHost,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    })
  }
  return pool
}

export const query = async <T>(sql: string, params?: any[]) => {
  const db = getDb()
  const [rows] = await db.execute(sql, params)
  return rows as T
}