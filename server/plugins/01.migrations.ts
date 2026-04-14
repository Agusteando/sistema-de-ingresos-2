import { getDb } from '../utils/db'

export default defineNitroPlugin(async () => {
  const db = getDb()
  try {
    // Only creating missing new tables; strict backward compatibility for existing ones.
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
  } catch (error) {
    console.error('Schema check error:', error)
  }
})