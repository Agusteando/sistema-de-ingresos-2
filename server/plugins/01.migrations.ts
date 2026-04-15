import { getDb } from '../utils/db'
import bcrypt from 'bcryptjs'

export default defineNitroPlugin(async () => {
  const db = getDb()

  // Ejecutor seguro de consultas: Si una falla, no detiene todo el proceso.
  const runSafeQuery = async (queryStr: string, params: any[] = []) => {
    try {
      await db.query(queryStr, params)
    } catch (err: any) {
      // Se ignoran errores de duplicidad si la tabla/columna ya existe,
      // se registran otros errores para diagnóstico.
      if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.error(`[Auto-Migration Error] Al ejecutar: ${queryStr.substring(0, 50)}... ->`, err.message)
      }
    }
  }

  // Comprobación atómica de columnas
  const checkAndAddColumn = async (table: string, column: string, definition: string, defaultAction?: string) => {
    try {
      const [cols]: any = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`)
      if (cols.length === 0) {
        console.log(`[Auto-Migration] Adaptando esquema: Agregando columna '${column}' a la tabla '${table}'.`)
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
        if (defaultAction) {
          await db.query(defaultAction)
        }
      }
    } catch (err: any) {
      console.error(`[Auto-Migration Error] Fallo al verificar/agregar la columna '${column}' en '${table}':`, err.message)
    }
  }

  console.log('[Auto-Migration] Verificando compatibilidad de la base de datos heredada...')

  // 1. Creación de tablas base ausentes si el sistema PHP no las tenía
  await runSafeQuery(`
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

  await runSafeQuery(`
    CREATE TABLE IF NOT EXISTS familias (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      apellidos VARCHAR(255) NOT NULL,
      tutor VARCHAR(255) NOT NULL,
      telefono VARCHAR(255) DEFAULT NULL,
      correo VARCHAR(255) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)

  // Si la tabla users no existía (o tenía otro nombre en el sistema legacy), se crea para el nuevo sistema
  await runSafeQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      password VARCHAR(255) NOT NULL,
      plantel VARCHAR(255) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)

  // 2. Verificación e inserción de nuevas columnas de forma no destructiva
  // Tabla: users
  await checkAndAddColumn('users', 'role', "VARCHAR(20) NOT NULL DEFAULT 'plantel'")
  await checkAndAddColumn(
    'users', 
    'planteles', 
    "TEXT", 
    "UPDATE users SET planteles = plantel WHERE plantel IS NOT NULL AND (planteles IS NULL OR planteles = '')"
  )
  await checkAndAddColumn('users', 'email', "VARCHAR(255) DEFAULT NULL")
  await checkAndAddColumn('users', 'avatar', "VARCHAR(255) DEFAULT NULL")

  // Tabla: base (Alumnos legacy)
  // Verificamos si existe la tabla base antes de intentar agregarle columnas
  try {
    const [baseTableExists]: any = await db.query(`SHOW TABLES LIKE 'base'`)
    if (baseTableExists.length > 0) {
      await checkAndAddColumn('base', 'interno', "TINYINT(1) NOT NULL DEFAULT 1")
      await checkAndAddColumn('base', 'familiaId', "INT DEFAULT NULL")
    }
  } catch (err) {
    console.error('[Auto-Migration Error] No se pudo comprobar la tabla base legacy.')
  }

  // 3. Sembrado (Seeding) de Administrador Global principal
  try {
    const superAdminEmail = 'desarrollo.tecnologico@casitaiedis.edu.mx'
    const [existingAdmin]: any = await db.query(`SELECT id FROM users WHERE email = ?`, [superAdminEmail])
    
    if (existingAdmin.length === 0) {
      const hash = bcrypt.hashSync('SUPER_ADMIN_AUTO_SEED', 10)
      const allPlanteles = 'PREEM,PREET,CT,CM,DM,CO,DC,PM,PT,SM,ST,IS,ISM'
      
      await db.query(
        `INSERT INTO users (username, password, email, planteles, role) VALUES (?, ?, ?, ?, 'global')`,
        ['Super Administrador', hash, superAdminEmail, allPlanteles]
      )
      console.log('[Auto-Migration] Cuenta administrativa global inicializada correctamente.')
    }
  } catch (err: any) {
    console.error('[Auto-Migration Error] Fallo al sembrar el usuario administrador:', err.message)
  }
})