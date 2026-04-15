import { PrismaClient } from '@prisma/client'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

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

let isSchemaReady = false
let schemaPromise: Promise<void> | null = null

const runSafeQuery = async (db: mysql.Pool, sql: string) => {
  try {
    await db.query(sql)
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.error(`[Schema Update Error] ${sql.substring(0, 50)}... ->`, err.message)
    }
  }
}

const checkAndAddColumn = async (db: mysql.Pool, table: string, column: string, definition: string, defaultAction?: string) => {
  try {
    const [cols]: any = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`)
    if (cols.length === 0) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      if (defaultAction) {
        try { await db.query(defaultAction) } catch(e) {}
      }
    }
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      console.error(`[Schema Update Error] No se pudo agregar la columna ${column} a ${table}:`, err.message)
      throw err 
    }
  }
}

export const ensureSchema = async () => {
  if (isSchemaReady) return
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = getDb()
      
      await runSafeQuery(db, `
        CREATE TABLE IF NOT EXISTS facturas (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          matricula VARCHAR(50) NOT NULL,
          rfc VARCHAR(20) NOT NULL,
          razonSocial VARCHAR(255) NOT NULL,
          regimenFiscal VARCHAR(10) DEFAULT NULL,
          usoCfdi VARCHAR(10) DEFAULT NULL,
          cp VARCHAR(10) DEFAULT NULL,
          correo VARCHAR(255) DEFAULT NULL,
          total DECIMAL(10,2) NOT NULL,
          folios TEXT NOT NULL,
          fecha DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)
      
      await runSafeQuery(db, `
        CREATE TABLE IF NOT EXISTS familias (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          apellidos VARCHAR(255) NOT NULL,
          tutor VARCHAR(255) NOT NULL,
          telefono VARCHAR(255) DEFAULT NULL,
          correo VARCHAR(255) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)
      
      await runSafeQuery(db, `
        CREATE TABLE IF NOT EXISTS users (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) NOT NULL,
          password VARCHAR(255) NOT NULL,
          plantel VARCHAR(255) DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await checkAndAddColumn(db, 'users', 'role', "VARCHAR(20) NOT NULL DEFAULT 'plantel'")
      await checkAndAddColumn(db, 'users', 'planteles', "TEXT", "UPDATE users SET planteles = plantel WHERE plantel IS NOT NULL AND (planteles IS NULL OR planteles = '')")
      await checkAndAddColumn(db, 'users', 'email', "VARCHAR(255) DEFAULT NULL")
      await checkAndAddColumn(db, 'users', 'avatar', "VARCHAR(255) DEFAULT NULL")

      try {
        const [tables]: any = await db.query(`SHOW TABLES LIKE 'base'`)
        if (tables.length > 0) {
          await checkAndAddColumn(db, 'base', 'interno', "TINYINT(1) NOT NULL DEFAULT 1")
          await checkAndAddColumn(db, 'base', 'familiaId', "INT DEFAULT NULL")
        }
      } catch(e) {}

      try {
        const superAdminEmail = 'desarrollo.tecnologico@casitaiedis.edu.mx'
        const [existingAdmin]: any = await db.query(`SELECT id FROM users WHERE email = ?`, [superAdminEmail])

        if (existingAdmin.length === 0) {
          const hash = bcrypt.hashSync('SUPER_ADMIN_AUTO_SEED', 10)
          const allPlanteles = 'PREEM,PREET,CT,CM,DM,CO,DC,PM,PT,SM,ST,IS,ISM'
          // Incluimos el campo legacy 'plantel' para evitar el fallo en strict mode
          await db.query(
            `INSERT INTO users (username, password, email, planteles, role, plantel) VALUES (?, ?, ?, ?, 'global', ?)`,
            ['Super Administrador', hash, superAdminEmail, allPlanteles, 'PREEM']
          )
        }
      } catch (err: any) {
        console.error('[Schema Update Error] Falla en sembrado admin:', err.message)
      }

      isSchemaReady = true
    })().catch(err => {
      schemaPromise = null
      throw err
    })
  }
  await schemaPromise
}

export const query = async <T>(sql: string, params?: any[], isRetry = false): Promise<T> => {
  await ensureSchema()
  const db = getDb()
  try {
    const [rows] = await db.query(sql, params)
    return rows as T
  } catch (err: any) {
    if (!isRetry && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE')) {
      console.warn('[DB Auto-Healing] Detectado esquema incompleto o desincronizado. Forzando re-evaluación...')
      isSchemaReady = false
      schemaPromise = null
      await ensureSchema()
      const [rows] = await db.query(sql, params)
      return rows as T
    }
    throw err
  }
}

export const executeTransaction = async (callback: (connection: mysql.PoolConnection) => Promise<any>) => {
  await ensureSchema()
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