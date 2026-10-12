import { executeStatementTransaction, query, runWithBridgeAgentId, type SqlStatement } from '../../../utils/db'
import { canCorrectDocumentAmount, centsToAmount, amountToCents } from '../../../../shared/utils/documentAmountCorrection'
import { readDocumentAmountCorrection } from '../../../utils/document-amount-correction'
import { notifyDocumentAmountCorrection } from '../../../utils/telegram-document-audit'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  if (!user?.hasFinancialAccess && !user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Se requiere acceso a Finanzas para ajustar importes.' })
  }
  const documento = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const newAmount = canCorrectDocumentAmount(body?.montoFinal, [])
  if (!Number.isSafeInteger(documento) || documento <= 0 || !newAmount.valid) {
    throw createError({ statusCode: 400, message: 'Ingresa un importe válido mayor a $0.00, con máximo dos decimales.' })
  }
  // An explanation is optional. Audit always captures user, document and values.
  const motivo = String(body?.motivo || 'monto_incorrecto').trim().slice(0, 80)
  const detalle = String(body?.detalle || '').trim().slice(0, 450)
  if (!['monto_incorrecto', 'beca_historica', 'convenio_no_registrado', 'otro'].includes(motivo)) {
    throw createError({ statusCode: 400, message: 'Motivo inválido.' })
  }
  const preview = await readDocumentAmountCorrection(documento, body?.ciclo)
  const editableMonths = preview.months.filter(month => month.editable)
  const selectedMonth = String(body?.mes || '').toLowerCase() === 'ev' ? 1 : Number(body?.mes)
  if (!preview.changeable || (Number.isInteger(selectedMonth) && selectedMonth > 0 && preview.months.some(month => month.mes === selectedMonth && !month.editable))) {
    throw createError({ statusCode: 409, message: 'El mes seleccionado tiene un ajuste de concepto con importe propio. No se modificó.' })
  }
  const evaluation = canCorrectDocumentAmount(body?.montoFinal, editableMonths)
  if (!evaluation.allowed) {
    throw createError({
      statusCode: 409,
      message: `Hay pagos vigentes de hasta ${preview.minimumAllowed.toFixed(2)}. Utiliza ese importe o uno mayor.`,
      data: { minimumAllowed: preview.minimumAllowed, blockingMonths: editableMonths.filter(row => row.paidCents > (evaluation.nextCents || 0)).map(row => ({ mes: row.mes, pagado: row.paid })) },
    })
  }
  // Catch another operator changing the amount while this modal was open.
  if (!Object.prototype.hasOwnProperty.call(body, 'expectedStoredAmount')
      || (body.expectedStoredAmount === null ? null : amountToCents(body.expectedStoredAmount))
      !== (preview.originalStoredAmount === null ? null : amountToCents(preview.originalStoredAmount))) {
    throw createError({ statusCode: 409, message: 'El importe cambió desde que abriste el ajuste. Actualiza la vista antes de guardar.' })
  }
  const montoFinal = centsToAmount(evaluation.nextCents!)
  if (editableMonths.every(row => amountToCents(row.currentAmount) === evaluation.nextCents)) {
    return { success: true, unchanged: true, documento, montoFinal, notification: { skipped: true } }
  }

  // The audit table is pre-existing in Aurora's schema, but Bridge installations
  // can lag behind. Never modify finance without a durable audit target.
  const tables = await query<any[]>(`SHOW TABLES LIKE 'documento_monto_correcciones'`)
  if (!tables.length) {
    throw createError({ statusCode: 503, message: 'Falta el registro de auditoría de ajustes. No se modificó el documento.' })
  }

  const actor = String(user?.name || user?.email || 'Sistema').slice(0, 255)
  const oldStored = preview.originalStoredAmount
  const actualMoney = preview.montoAnterior
  const requestId = String(event.context.auroraRequestId || '')
  const auditDetail = JSON.stringify({
    motivoDetalle: detalle,
    requestId,
    originalStoredAmount: oldStored,
    previousScholarship: preview.previousScholarship,
    months: preview.months.map(month => ({
      mes: month.mes, conceptoNombre: month.conceptoNombre,
      montoAnterior: month.currentAmount, paid: month.paid,
      difference: month.difference,
    })),
    periods: preview.activeChangePeriods,
    periodsChanged: 0,
  })
  // One document row only. Existing period overrides and referencesdepago
  // remain untouched. Revalidate payments in the transaction immediately
  // after locking the documento row (payment inserts lock the same parent).
  const affectedMonths = editableMonths.map(month => month.mes)
  const placeholders = affectedMonths.map(() => '?').join(', ')
  const statements: SqlStatement[] = [
    {
      sql: `SELECT documento FROM documentos WHERE documento = ? FOR UPDATE`,
      params: [documento],
    },
    {
      sql: `UPDATE documentos SET montoFinal = ?
            WHERE documento = ?
              AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
              AND montoFinal <=> ?
              AND NOT EXISTS (
                SELECT 1 FROM (
                  SELECT CASE WHEN LOWER(TRIM(CAST(mes AS CHAR))) = 'ev' THEN 1
                              ELSE CAST(mes AS UNSIGNED) END AS payment_month
                    FROM referenciasdepago
                   WHERE documento = ?
                     AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'vigente'
                     AND (CASE WHEN LOWER(TRIM(CAST(mes AS CHAR))) = 'ev' THEN 1
                               ELSE CAST(mes AS UNSIGNED) END) IN (${placeholders})
                   GROUP BY payment_month
                  HAVING ROUND(SUM(monto), 2) > ?
                ) AS too_much_paid
              )`,
      params: [montoFinal, documento, oldStored, documento, ...affectedMonths, montoFinal],
    },
    { sql: 'SET @aurora_amount_changed = ROW_COUNT()' },
    {
      sql: `INSERT INTO documento_monto_correcciones
        (documento, matricula, ciclo, monto_anterior, monto_nuevo, mensualidades_afectadas,
         pago_maximo_mensual, pagos_totales, periodos_actualizados, motivo, detalle_anterior, usuario)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?
         WHERE @aurora_amount_changed = 1`,
      params: [documento, preview.matricula, preview.ciclo, actualMoney, montoFinal,
        preview.affectedMonths, preview.minimumAllowed, preview.totalPaid,
        motivo, auditDetail, actor],
    },
    { sql: 'SELECT @aurora_amount_changed AS changed, LAST_INSERT_ID() AS auditId' },
  ]
  const results = await executeStatementTransaction<any>(statements)
  const outcome = Array.isArray(results[results.length - 1]) ? results[results.length - 1][0] : results[results.length - 1]
  if (Number(outcome?.changed || 0) !== 1 || Number(outcome?.auditId || 0) <= 0) {
    throw createError({ statusCode: 409, message: 'No se confirmó el ajuste. Otro pago o cambio pudo haber ocurrido. Actualiza el estado de cuenta.' })
  }

  const auditId = Number(outcome.auditId)
  console.info('[DocumentAmount] Correction committed', {
    documento, auditId, requestId, actor, before: actualMoney, after: montoFinal,
    periods: 0,
  })
  const message = [
    `*${actor}* modificó el importe del documento *#${documento}* de *$${actualMoney.toFixed(2)}* a *$${montoFinal.toFixed(2)}*.`,
    `Matrícula: ${preview.matricula} · Concepto: ${preview.conceptoNombre} · Ciclo: ${preview.ciclo}`,
    `Meses con importe base: ${preview.affectedMonths} · Máximo pagado por mes: $${preview.minimumAllowed.toFixed(2)}`,
    `Motivo: ${motivo}${detalle ? ` · ${detalle}` : ''}`,
    `Auditoría: #${auditId}${requestId ? ` · Ref: ${requestId}` : ''}`,
  ].join('\n')
  const notification = await notifyDocumentAmountCorrection(message)
  if (!notification.delivered) {
    console.warn('[DocumentAmount] Telegram notification pending after committed write', {
      documento, auditId, requestId, reason: notification.errorCode,
    })
  }
  return {
    success: true, documento, montoAnterior: actualMoney, montoFinal,
    mensualidadesAfectadas: preview.affectedMonths, pagosTotales: preview.totalPaid,
    pagoMaximoMensual: preview.minimumAllowed, periodosActualizados: 0,
    auditId, notification: { delivered: notification.delivered },
  }
}))
