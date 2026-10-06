import { createHash } from 'node:crypto'
import { executeStatementTransaction, runRawSqlStatement } from './db'

export const PM1152_CANONICAL = 57186
export const PM1152_DUPLICATES = [57189, 57190, 57191]
const ALL_IDS = [PM1152_CANONICAL, ...PM1152_DUPLICATES]
const INCIDENT = 'PM1152-TE-20261006'

export const pm1152LedgerFingerprint = (ledger: any) => createHash('sha256')
  .update(JSON.stringify({ documents: ledger.documents, periods: ledger.periods, payments: ledger.payments }))
  .digest('hex')

export const assertPm1152Reconciliation = (ledger: any) => {
  if (ledger?.matricula !== 'PM1152' || ledger?.cycle !== '2026') throw new Error('Unexpected incident scope')
  const target = ledger.documents.filter((doc: any) => ALL_IDS.includes(Number(doc.documento)))
  if (target.length !== ALL_IDS.length) throw new Error('Incident documents changed')
  for (const doc of target) {
    if (doc.matricula !== 'PM1152' || String(doc.ciclo) !== '2026' || Number(doc.concepto) !== 1028 ||
      Number(doc.costo) !== 800 || Number(doc.montoFinal) !== 0 || Number(doc.beca) !== 100 ||
      Number(doc.eventual) !== 0 || doc.plazo !== '1,2,3,4,5,6,7,8,9,10,11' || Number(doc.meses) !== 11 ||
      doc.becaNombre !== 'Mercadotecnia' || doc.becaTipos !== 'Mercadotecnia') throw new Error('Incident financial signature changed')
  }
  if (ledger.periods.some((row: any) => ALL_IDS.includes(Number(row.documento)))) throw new Error('Incident now has period history')
  if (ledger.payments.some((row: any) => ALL_IDS.includes(Number(row.documento)))) throw new Error('Incident now has payment history')
  const canonical = target.find((doc: any) => Number(doc.documento) === PM1152_CANONICAL)
  if (canonical.estatus !== 'Activo') throw new Error('Canonical document is no longer active')
  const duplicates = target.filter((doc: any) => PM1152_DUPLICATES.includes(Number(doc.documento)))
  if (duplicates.every((doc: any) => doc.estatus === 'Cancelado')) return { alreadyApplied: true }
  if (!duplicates.every((doc: any) => doc.estatus === 'Activo')) throw new Error('Incident cancellation state changed')
  return { alreadyApplied: false }
}

export const reconcilePm1152 = async (ledger: any, expectedFingerprint: string, requestId: string) => {
  if (pm1152LedgerFingerprint(ledger) !== expectedFingerprint) throw createError({ statusCode: 409, message: 'El estado de cuenta cambió. Vuelve a consultar la evidencia.' })
  let state
  try { state = assertPm1152Reconciliation(ledger) } catch (error: any) {
    throw createError({ statusCode: 409, message: error.message })
  }
  if (state.alreadyApplied) return { applied: false, alreadyApplied: true, canonical: PM1152_CANONICAL, cancelled: PM1152_DUPLICATES }
  for (const table of ['documentos', 'referenciasdepago', 'documento_concepto_periodos']) {
    if (String(ledger.schema?.engines?.[table]).toLowerCase() !== 'innodb') {
      throw createError({ statusCode: 409, message: 'La corrección requiere tablas transaccionales InnoDB.' })
    }
  }
  await runRawSqlStatement(`CREATE TABLE IF NOT EXISTS financial_incident_reconciliations (
    incident_key VARCHAR(64) NOT NULL PRIMARY KEY,
    matricula VARCHAR(255) NOT NULL, ciclo VARCHAR(50) NOT NULL,
    canonical_documento BIGINT NOT NULL, cancelled_documentos TEXT NOT NULL,
    before_snapshot LONGTEXT NOT NULL, request_id VARCHAR(100) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  const results = await executeStatementTransaction<any>([
    { sql: 'SELECT documento FROM documentos WHERE documento IN (57186,57189,57190,57191) FOR UPDATE' },
    {
      sql: `INSERT INTO financial_incident_reconciliations
        (incident_key, matricula, ciclo, canonical_documento, cancelled_documentos, before_snapshot, request_id)
        SELECT ?, 'PM1152', '2026', 57186, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM documentos WHERE documento IN (57186,57189,57190,57191)
          AND matricula = 'PM1152' AND ciclo = '2026' AND concepto = '1028' AND estatus = 'Activo'
          AND costo = 800 AND montoFinal = 0 AND beca = '100' AND eventual = 0
          AND plazo = '1,2,3,4,5,6,7,8,9,10,11' AND meses = '11'
          AND becaNombre = 'Mercadotecnia' AND becaTipos = 'Mercadotecnia') = 4
          AND NOT EXISTS (SELECT 1 FROM referenciasdepago WHERE documento IN (57186,57189,57190,57191))
          AND NOT EXISTS (SELECT 1 FROM documento_concepto_periodos WHERE documento IN (57186,57189,57190,57191))`,
      params: [INCIDENT, JSON.stringify(PM1152_DUPLICATES), JSON.stringify(ledger), requestId],
    },
    {
      sql: `UPDATE documentos D JOIN financial_incident_reconciliations I
        ON I.incident_key = ? AND I.request_id = ?
        SET D.estatus = 'Cancelado'
        WHERE D.documento IN (57189,57190,57191) AND D.matricula = 'PM1152'
          AND D.ciclo = '2026' AND D.concepto = '1028' AND D.estatus = 'Activo'`,
      params: [INCIDENT, requestId],
    },
  ])
  if (Number(results[1]?.affectedRows) !== 1 || Number(results[2]?.affectedRows) !== 3) {
    throw createError({ statusCode: 409, message: 'La corrección no se aplicó: los controles detectaron cambios concurrentes.' })
  }
  console.info('[FinancialIncident] Duplicados reconciliados', { incident: INCIDENT, requestId, canonical: PM1152_CANONICAL, cancelled: PM1152_DUPLICATES })
  return { applied: true, alreadyApplied: false, canonical: PM1152_CANONICAL, cancelled: PM1152_DUPLICATES }
}
