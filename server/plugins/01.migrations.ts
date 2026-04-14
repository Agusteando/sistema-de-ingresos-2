import { getDb } from '../utils/db'

export default defineNitroPlugin(async () => {
  console.log('[Schema] Verifying IECS-IEDIS database structure...')
  const db = getDb()

  try {
    // Core legacy tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS base (
        matricula VARCHAR(50) PRIMARY KEY,
        nombreCompleto VARCHAR(255) NOT NULL,
        apellidoPaterno VARCHAR(100),
        apellidoMaterno VARCHAR(100),
        nombres VARCHAR(100),
        birth DATE,
        padre VARCHAR(255),
        genero VARCHAR(20),
        plantel VARCHAR(50),
        nivel VARCHAR(50),
        grado VARCHAR(50),
        grupo VARCHAR(50),
        telefono VARCHAR(50),
        correo VARCHAR(255),
        usuario VARCHAR(100),
        estatus VARCHAR(50) DEFAULT 'Activo',
        ciclo VARCHAR(20),
        interno TINYINT(1) DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS conceptos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        concepto VARCHAR(255) NOT NULL,
        description TEXT,
        costo DECIMAL(10,2) NOT NULL,
        eventual TINYINT(1) DEFAULT 0,
        ciclo VARCHAR(20),
        plazo INT DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS documentos (
        documento INT AUTO_INCREMENT PRIMARY KEY,
        matricula VARCHAR(50) NOT NULL,
        conceptoId INT,
        costo DECIMAL(10,2) NOT NULL,
        meses INT DEFAULT 1,
        beca DECIMAL(5,2) DEFAULT 0,
        ciclo VARCHAR(20),
        INDEX idx_matricula (matricula)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS referenciasdepago (
        folio INT AUTO_INCREMENT PRIMARY KEY,
        matricula VARCHAR(50) NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        ciclo VARCHAR(20),
        mes INT,
        recargo TINYINT(1) DEFAULT 0,
        importeTotal DECIMAL(10,2),
        documento INT,
        concepto VARCHAR(255),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        formaDePago VARCHAR(50),
        cancelada_por VARCHAR(100) DEFAULT NULL,
        estatus VARCHAR(50) DEFAULT 'Vigente',
        INDEX idx_doc (documento),
        INDEX idx_mat (matricula)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // New table required for end-to-end Facturación persistence
    await db.query(`
      CREATE TABLE IF NOT EXISTS facturas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        matricula VARCHAR(50) NOT NULL,
        rfc VARCHAR(20) NOT NULL,
        razonSocial VARCHAR(255) NOT NULL,
        regimenFiscal VARCHAR(10),
        usoCfdi VARCHAR(10),
        cp VARCHAR(10),
        correo VARCHAR(255),
        total DECIMAL(10,2) NOT NULL,
        folios TEXT NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mat_fac (matricula)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    console.log('[Schema] Initialization complete. Data preserved.')
  } catch (error) {
    console.error('[Schema] Migration failed:', error)
  }
})