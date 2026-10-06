import { createHash } from 'node:crypto'
import { executeStatementTransaction, query, runRawSqlStatement, type SqlStatement } from './db'

const requestHash = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex')

export const createDocumentWithRequest = async (input: {
  statement: SqlStatement
  requestKey?: unknown
  payload: unknown
  matricula: string
  ciclo: string
  actor: string
  requestId: string
  beforeCreate: () => Promise<unknown>
}) => {
  const key = String(input.requestKey || '').trim()
  if (!key) {
    // Older clients retain their existing creation contract.
    await input.beforeCreate()
    const [result] = await executeStatementTransaction<any>([input.statement])
    return { documento: Number(result?.insertId || 0), replayed: false }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    throw createError({ statusCode: 400, message: 'Identificador de solicitud inválido.' })
  }
  const hash = requestHash(input.payload)
  // This isolated table is created only in the physical database receiving an
  // idempotent request. It adds no constraint to intentional repeated purchases.
  await runRawSqlStatement(`
    CREATE TABLE IF NOT EXISTS documento_creacion_solicitudes (
      request_key VARCHAR(36) NOT NULL PRIMARY KEY,
      payload_hash CHAR(64) NOT NULL,
      matricula VARCHAR(255) NOT NULL,
      ciclo VARCHAR(50) NOT NULL,
      documento BIGINT DEFAULT NULL,
      actor VARCHAR(255) DEFAULT NULL,
      request_id VARCHAR(100) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_documento_creacion_documento (documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  const validate = async (row: any) => {
    if (row?.payload_hash !== hash) {
      throw createError({ statusCode: 409, message: 'La solicitud ya corresponde a otros datos. Vuelve a abrir el formulario.' })
    }
    const documento = Number(row?.documento || 0)
    if (!documento) throw createError({ statusCode: 500, message: 'No se pudo confirmar el documento creado.' })
    const [doc] = await query<any[]>('SELECT estatus FROM documentos WHERE documento = ?', [documento])
    if (String(doc?.estatus || '').trim().toLowerCase() !== 'activo') {
      throw createError({ statusCode: 409, message: 'El documento de esta solicitud ya no está activo. Vuelve a abrir el formulario.' })
    }
    return documento
  }
  const [existing] = await query<any[]>(
    'SELECT payload_hash, documento FROM documento_creacion_solicitudes WHERE request_key = ?', [key],
  )
  if (existing) return { documento: await validate(existing), replayed: true }
  await input.beforeCreate()

  // The request primary-key insert serializes concurrent retries on the same
  // MySQL connection/transaction in both direct and bridge transports.
  const valuesMatch = input.statement.sql.match(/\bVALUES\s*(\([\s\S]*\))\s*$/i)
  if (!valuesMatch) throw new Error('Document creation requires an INSERT VALUES statement')
  const insertSelect = input.statement.sql.slice(0, valuesMatch.index)
    + 'SELECT ' + valuesMatch[1].slice(1, -1)
    + ' FROM documento_creacion_solicitudes WHERE request_key = ? AND payload_hash = ? AND documento IS NULL'
  const results = await executeStatementTransaction<any>([
    {
      sql: `INSERT INTO documento_creacion_solicitudes (request_key, payload_hash, matricula, ciclo, actor, request_id)
        VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE request_key = request_key`,
      params: [key, hash, input.matricula, input.ciclo, input.actor, input.requestId],
    },
    { sql: insertSelect, params: [...(input.statement.params as any[] || []), key, hash] },
    {
      sql: `UPDATE documento_creacion_solicitudes SET documento = LAST_INSERT_ID()
        WHERE request_key = ? AND payload_hash = ? AND documento IS NULL`,
      params: [key, hash],
    },
    { sql: 'SELECT payload_hash, documento FROM documento_creacion_solicitudes WHERE request_key = ?', params: [key] },
  ])
  return { documento: await validate(results[3]?.[0]), replayed: Number(results[1]?.affectedRows || 0) === 0 }
}
