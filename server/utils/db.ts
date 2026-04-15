import { PrismaClient } from '@prisma/client'
import mysql from 'mysql2/promise'

// Inicialización de Prisma asegurada contra reconexiones de Hot Reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

let pool: mysql.Pool

// Soporte transicional legacy. Toda nueva escritura debe fluir mediante Prisma
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

export const executeTransaction = async (callback: (connection: mysql.PoolConnection) => Promise<any>) => {
  const db = getDb()
  const connection = await db.getConnection()
  await connection.beginTransaction()
  try {
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}