import { getDb } from '../utils/db'
import bcrypt from 'bcryptjs'

export default defineNitroPlugin(async () => {
  const db = getDb()
  try {
    await db.query(`
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS familias (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        apellidos VARCHAR(255) NOT NULL,
        tutor VARCHAR(255) NOT NULL,
        telefono VARCHAR(255) DEFAULT NULL,
        correo VARCHAR(255) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    const [roleCols]: any = await db.query(`SHOW COLUMNS FROM users LIKE 'role'`)
    if (roleCols.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'plantel'`)
    }

    const [plantelesCols]: any = await db.query(`SHOW COLUMNS FROM users LIKE 'planteles'`)
    if (plantelesCols.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN planteles TEXT`)
      await db.query(`UPDATE users SET planteles = plantel WHERE plantel IS NOT NULL AND planteles IS NULL`)
    }

    const [internoCols]: any = await db.query(`SHOW COLUMNS FROM base LIKE 'interno'`)
    if (internoCols.length === 0) {
      await db.query(`ALTER TABLE base ADD COLUMN interno TINYINT(1) NOT NULL DEFAULT 1`)
    }

    const [familiaIdCols]: any = await db.query(`SHOW COLUMNS FROM base LIKE 'familiaId'`)
    if (familiaIdCols.length === 0) {
      await db.query(`ALTER TABLE base ADD COLUMN familiaId INT DEFAULT NULL`)
    }

    const superAdminEmail = 'desarrollo.tecnologico@casitaiedis.edu.mx'
    const [existingAdmin]: any = await db.query(`SELECT id FROM users WHERE email = ?`, [superAdminEmail])
    if (existingAdmin.length === 0) {
      const hash = bcrypt.hashSync('SUPER_ADMIN_AUTO_SEED', 10)
      const allPlanteles = 'PREEM,PREET,CT,CM,DM,CO,DC,PM,PT,SM,ST,IS,ISM'
      await db.query(
        `INSERT INTO users (username, password, email, planteles, role) VALUES (?, ?, ?, ?, 'global')`,
        ['Super Administrador', hash, superAdminEmail, allPlanteles]
      )
    }

  } catch (error) {
    console.error('Schema check error:', error)
  }
})