import { parseDocumentMonths, schoolMonthLabel, serializeDocumentMonths } from '../../shared/utils/documentMonths'
import { query, executeStatementTransaction } from './db'

const truthy = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())

export const planDocumentStart = (doc: any, startMonth: unknown) => {
  const months = parseDocumentMonths(doc.plazo, doc.meses)
  const start = Number(startMonth)
  if (truthy(doc.eventual) || months.length < 2 || !Number.isInteger(start) || !months.includes(start) || start <= months[0]) {
    throw createError({ statusCode: 400, message: 'Seleccione un mes de inicio posterior al actual, dentro de esta tira.' })
  }
  return { removedMonths: months.filter(month => month < start), keptMonths: months.filter(month => month >= start) }
}

export const previewDocumentStart = async (doc: any) => {
  const months = parseDocumentMonths(doc.plazo, doc.meses)
  const payments = await query<any[]>(`
    SELECT CAST(mes AS UNSIGNED) AS mes, COUNT(*) AS paymentCount
    FROM referenciasdepago WHERE documento = ? AND LOWER(TRIM(estatus)) = 'vigente'
    GROUP BY CAST(mes AS UNSIGNED)
  `, [doc.documento])
  const periods = await query<any[]>(`
    SELECT start_mes, end_mes, accion FROM documento_concepto_periodos
    WHERE documento = ? AND estatus = 'Activo' ORDER BY start_mes DESC, id DESC
  `, [doc.documento])
  const activeMonths = months.filter(month => periods.find(period => month >= Number(period.start_mes) && (period.end_mes == null || month <= Number(period.end_mes)))?.accion !== 'cancelacion')
  return {
    documento: Number(doc.documento),
    eligible: !truthy(doc.eventual) && activeMonths.length > 1,
    months: months.map(mes => ({ mes, label: schoolMonthLabel(mes), paymentCount: Number(payments.find(payment => Number(payment.mes) === mes)?.paymentCount || 0) })),
    startOptions: activeMonths.filter(month => month > months[0]),
    // Exact coverage shown to the operator; reject a stale dialog instead of retiring additional months.
    coverage: serializeDocumentMonths(months),
  }
}

export const updateDocumentStart = async (doc: any, body: any, user: any, requestId: string) => {
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (!motivo || motivo.length > 2000) {
    throw createError({ statusCode: 400, message: 'Escriba el motivo del ajuste (máximo 2000 caracteres).' })
  }
  const plan = planDocumentStart(doc, body.startMes)
  const preview = await previewDocumentStart(doc)
  if (!preview.eligible || !preview.startOptions.includes(Number(body.startMes))) {
    throw createError({ statusCode: 409, message: 'El inicio debe conservar meses activos de esta tira.' })
  }
  if (body.coverage !== preview.coverage) {
    throw createError({ statusCode: 409, message: 'La tira cambió. Vuelva a abrir Ajustar concepto para revisar los meses.' })
  }
  const blocked = preview.months.filter(month => plan.removedMonths.includes(month.mes) && month.paymentCount > 0)
  if (blocked.length) {
    throw createError({ statusCode: 409, message: `No se puede retirar ${blocked.map(month => month.label).join(', ')}: tiene pagos vigentes.`, data: { requestId, code: 'DOCUMENT_START_HAS_PAYMENTS' } })
  }

  let auditTable = ''
  for (const candidate of ['solicitudescancelaciones', 'solicitudesCancelaciones']) {
    if ((await query<any[]>('SHOW TABLES LIKE ?', [candidate])).length) { auditTable = candidate; break }
  }
  if (!auditTable) throw createError({ statusCode: 409, message: 'No se encontró Cancelaciones para registrar el ajuste. No se modificó la tira.' })
  const engines = await query<any[]>(`SHOW TABLE STATUS WHERE Name IN ('documentos', 'referenciasdepago', '${auditTable}')`)
  if (engines.length !== 3 || engines.some(row => String(row.Engine || '').toLowerCase() !== 'innodb')) {
    throw createError({ statusCode: 409, message: 'El ajuste requiere tablas transaccionales para conservar pagos y auditoría.' })
  }

  const actor = String(user?.name || user?.email || 'Sistema').slice(0, 255)
  const auditReason = [
    `Ajuste de mes de inicio · Documento ${doc.documento} · ${doc.matricula} · Ciclo ${doc.ciclo}`,
    `Inicio: ${schoolMonthLabel(preview.months[0].mes)} → ${schoolMonthLabel(body.startMes)}`,
    `Meses retirados: ${plan.removedMonths.map(schoolMonthLabel).join(', ')}`,
    `Meses conservados: ${plan.keptMonths.map(schoolMonthLabel).join(', ')}`,
    `Motivo: ${motivo}`,
    'Registro de auditoría sin cancelación de pago ni código de autorización.',
    `Cobertura anterior: ${String(doc.plazo)} · meses: ${String(doc.meses)} · Ref: ${requestId}`,
  ].join('\n')
  const placeholders = plan.removedMonths.map(() => '?').join(', ')
  const results = await executeStatementTransaction<any>([
    { sql: 'SELECT documento FROM documentos WHERE documento = ? FOR UPDATE', params: [doc.documento] },
    // Current locking read serializes payment insertion, including the empty range.
    { sql: `SELECT folio FROM referenciasdepago WHERE documento = ? AND CAST(mes AS UNSIGNED) IN (${placeholders}) FOR UPDATE`, params: [doc.documento, ...plan.removedMonths] },
    { sql: `UPDATE documentos SET plazo = ?, meses = ?
      WHERE documento = ? AND estatus = 'Activo' AND plazo <=> ? AND meses <=> ?
      AND NOT EXISTS (SELECT 1 FROM referenciasdepago WHERE documento = ?
        AND LOWER(TRIM(estatus)) = 'vigente' AND CAST(mes AS UNSIGNED) IN (${placeholders}))`,
      params: [serializeDocumentMonths(plan.keptMonths), String(plan.keptMonths.length), doc.documento, doc.plazo, doc.meses, doc.documento, ...plan.removedMonths] },
    { sql: 'SET @aurora_start_changed = ROW_COUNT()' },
    // Folio 0 intentionally never targets a receipt. Amount 0 is an audit event, not a refund.
    { sql: `INSERT INTO ${auditTable} (folio, motivo, monto, nombreCompleto, conceptoNombre, usuario, usuarioId, revisado_por, status)
      SELECT 0, ?, 0, ?, ?, ?, 0, ?, 'aceptada' WHERE @aurora_start_changed = 1`,
      params: [auditReason, String(doc.nombreCompleto || doc.matricula).slice(0, 255), String(doc.conceptoNombre || '').slice(0, 255), actor, actor] },
    { sql: 'SELECT @aurora_start_changed AS changed, LAST_INSERT_ID() AS auditId' },
  ])
  const outcome = results[results.length - 1]?.[0]
  if (Number(outcome?.changed) !== 1) {
    throw createError({ statusCode: 409, message: 'La tira o sus pagos cambiaron. No se aplicó el ajuste; vuelva a consultar.', data: { requestId, code: 'DOCUMENT_START_CONFLICT' } })
  }
  console.info('[Documentos] Mes de inicio ajustado', { documento: doc.documento, matricula: doc.matricula, ciclo: doc.ciclo, ...plan, actor, auditId: outcome.auditId, requestId })
  return { success: true, action: 'change_start', documento: Number(doc.documento), ...plan, auditId: Number(outcome.auditId), requestId }
}
