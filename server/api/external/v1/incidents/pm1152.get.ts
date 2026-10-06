import { assertAuroraExternalApiToken } from '../../../../utils/external-api-auth'
import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../../../utils/db'

// Incident access is deliberately limited to the authorized student and cycle.
// Raw reads avoid query()'s automatic schema-repair/migration behavior.
const MATRICULA = 'PM1152'
const CYCLES = ['2026', '2026-2027']
const DOCUMENT_COLUMNS = [
  'documento', 'matricula', 'concepto', 'conceptoNombre', 'ciclo', 'estatus',
  'costo', 'montoFinal', 'plazo', 'meses', 'eventual', 'beca', 'becaNombre',
  'becaTipos', 'becaMotivo', 'becaMonto', 'becaPorcentaje', 'becaCartaGenerada', 'becaCartaFecha',
  'responsable', 'fecha', 'created_at', 'updated_at', 'fecha_registro',
]
const PAYMENT_COLUMNS = [
  'folio', 'folio_plantel', 'documento', 'matricula', 'ciclo', 'concepto',
  'conceptoNombre', 'mes', 'mesReal', 'monto', 'importeTotal', 'saldoAntes',
  'saldoDespues', 'pagos', 'pagosDespues', 'fecha', 'fecha_original',
  'fecha_modificada_at', 'fecha_modificada_por', 'formaDePago', 'estatus',
  'depurado', 'depurado_por', 'depurado_fecha', 'pago_otro_plantel', 'plantel_pago',
]

export const readPm1152Ledger = async (event: any) => {
  assertAuroraExternalApiToken(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')

  const transport = getDbTransport()
  return await runWithBridgeAgentId(transport === 'bridge' ? 'PM' : undefined, async () => {
    const [student] = await runRawSqlStatement<any[]>(
      'SELECT matricula, plantel FROM base WHERE matricula = ? LIMIT 1', [MATRICULA],
    )
    if (!student || String(student.plantel || '').trim().toUpperCase() !== 'PM') {
      throw createError({ statusCode: 409, message: 'La fuente no confirmó PM1152 en PM.' })
    }

    const documentSchema = await runRawSqlStatement<any[]>('SHOW COLUMNS FROM documentos')
    const paymentSchema = await runRawSqlStatement<any[]>('SHOW COLUMNS FROM referenciasdepago')
    const selectKnown = (schema: any[], allowed: string[]) => {
      const known = new Set(schema.map(row => String(row.Field)))
      return allowed.filter(column => known.has(column)).map(column => `\`${column}\``).join(', ')
    }
    const documents = await runRawSqlStatement<any[]>(`
      SELECT ${selectKnown(documentSchema, DOCUMENT_COLUMNS)} FROM documentos
      WHERE matricula = ? AND CAST(ciclo AS CHAR) IN (?, ?)
      ORDER BY documento ASC
    `, [MATRICULA, ...CYCLES])
    const ids = documents.map(doc => Number(doc.documento)).filter(id => Number.isInteger(id) && id > 0)
    const placeholders = ids.map(() => '?').join(',')
    const periods = ids.length ? await runRawSqlStatement<any[]>(`
      SELECT * FROM documento_concepto_periodos
      WHERE documento IN (${placeholders}) ORDER BY documento, start_mes, id
    `, ids) : []
    const payments = await runRawSqlStatement<any[]>(`
      SELECT ${selectKnown(paymentSchema, PAYMENT_COLUMNS)} FROM referenciasdepago
      WHERE (matricula = ? AND CAST(ciclo AS CHAR) IN (?, ?))
        ${ids.length ? `OR documento IN (${placeholders})` : ''}
      ORDER BY folio ASC
    `, [MATRICULA, ...CYCLES, ...ids])

    const corrections: Record<string, any[]> = {}
    for (const table of ['documento_monto_correcciones', 'documento_concepto_correcciones']) {
      const exists = await runRawSqlStatement<any[]>('SHOW TABLES LIKE ?', [table])
      corrections[table] = exists.length && ids.length ? await runRawSqlStatement<any[]>(`
        SELECT * FROM ${table} WHERE documento IN (${placeholders}) ORDER BY id
      `, ids) : []
    }
    const engines: Record<string, string> = {}
    for (const table of ['documentos', 'referenciasdepago', 'documento_concepto_periodos']) {
      const [status] = await runRawSqlStatement<any[]>('SHOW TABLE STATUS LIKE ?', [table])
      engines[table] = String(status?.Engine || '')
    }
    const indexes = await runRawSqlStatement<any[]>('SHOW INDEX FROM documentos')
    return {
      ok: true,
      version: 'pm1152-ledger-v1',
      matricula: MATRICULA,
      cycle: CYCLES[0],
      source: { transport, agentId: transport === 'bridge' ? 'PM' : null },
      requestId: event.context.auroraRequestId || null,
      queriedAt: new Date().toISOString(),
      schema: { documents: documentSchema, payments: paymentSchema, documentIndexes: indexes, engines },
      documents, periods, payments, corrections,
    }
  })
}

export default defineEventHandler(readPm1152Ledger)
