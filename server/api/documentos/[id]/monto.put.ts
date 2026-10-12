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
  const motivo = String(body?.motivo || '').trim().replace(/\s+/g, ' ').slice(0, 80)
  const detalle = String(body?.detalle || '').trim().slice(0, 450)
  if (!['monto_incorrecto', 'beca_historica', 'convenio_no_registrado', 'otro'].includes(motivo)) {
    throw createError({ statusCode: 400, message: 'Selecciona el motivo de la corrección.' })
  }
  if (detalle.length < 8) {
    throw createError({ statusCode: 400, message: 'Describe el motivo del ajuste (mínimo 8 caracteres).' })
  }
  const preview = await readDocumentAmountCorrection(documento, body?.ciclo)
  const evaluation = canCorrectDocumentAmount(body?.montoFinal, preview.months)
  if (!evaluation.allowed) {
    throw createError({
      statusCode: 409,
      message: `El importe no puede ser menor a $ ${preview.minimumAllowed.toFixed(2)} porque ya hay pagos o depuraciones vigentes.`,
      data: { minimumAllowed: preview.minimumAllowed, blockingMonths: preview.months.filter(row => row.paidCents > (evaluation.nextCents || 0)).map(row => ({ mes: row.mes, pagado: row.paid })) },
    })
  }
  // Catch another operator changing the amount while this modal was open.
  if (!Object.prototype.hasOwnProperty.call(body, 'expectedStoredAmount')
      || (body.expectedStoredAmount === null ? null : amountToCents(body.expectedStoredAmount))
      !== (preview.originalStoredAmount === null ? null : amountToCents(preview.originalStoredAmount))) {
    throw createError({ statusCode: 409, message: 'El importe cambió desde que abriste el ajuste. Actualiza la vista antes de guardar.' })
  }
  const montoFinal = centsToAmount(evaluation.nextCents!)
  if (preview.months.every(row => amountToCents(row.currentAmount) === evaluation.nextCents)) {
    return { success: true, unchanged: true, documento, montoFinal, notification: { skipped: true } }
  }
  // An unchanged document base with different historic concept-period amounts
  // must not rewrite a period silently without a corresponding audit write.
  if (amountToCents(preview.originalStoredAmount) === evaluation.nextCents) {
    throw createError({ statusCode: 409, message: 'Los importes de los periodos son distintos. Actualiza el estado de cuenta antes de hacer este ajuste.' })
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
  })
  // Atomic write and audit. ROW_COUNT + session variable are evaluated in the
  // SAME Bridge transaction/connection. A concurrent lower-payment write is
  // rejected by the grouped payment guard; no history records are touched.
  const statements: SqlStatement[] = [
    {
      sql: `UPDATE documentos SET montoFinal = ?
            WHERE documento = ?
              AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
              AND montoFinal <=> ?
              AND NOT EXISTS (
                SELECT 1 FROM (
                  SELECT mes FROM referenciasdepago
                   WHERE documento = ? AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'vigente'
                   GROUP BY mes HAVING ROUND(SUM(monto), 2) > ?
                ) AS too_much_paid
              )`,
      params: [montoFinal, documento, oldStored, documento, montoFinal],
    },
    { sql: 'SET @aurora_amount_changed = ROW_COUNT()' },
    {
      sql: `UPDATE documento_concepto_periodos
             SET montoFinal = ?
           WHERE documento = ? AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
             AND LOWER(TRIM(CAST(accion AS CHAR))) = 'cambio'
             AND @aurora_amount_changed = 1`,
      params: [montoFinal, documento],
    },
    { sql: 'SET @aurora_amount_periods = ROW_COUNT()' },
    {
      sql: `INSERT INTO documento_monto_correcciones
        (documento, matricula, ciclo, monto_anterior, monto_nuevo, mensualidades_afectadas,
         pago_maximo_mensual, pagos_totales, periodos_actualizados, motivo, detalle_anterior, usuario)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, @aurora_amount_periods, ?, ?, ?
         WHERE @aurora_amount_changed = 1`,
      params: [documento, preview.matricula, preview.ciclo, actualMoney, montoFinal,
        preview.affectedMonths, preview.minimumAllowed, preview.totalPaid,
        motivo, auditDetail, actor],
    },
    { sql: 'SELECT @aurora_amount_changed AS changed, @aurora_amount_periods AS periods, LAST_INSERT_ID() AS auditId' },
  ]
  const results = await executeStatementTransaction<any>(statements)
  const outcome = Array.isArray(results[results.length - 1]) ? results[results.length - 1][0] : results[results.length - 1]
  if (Number(outcome?.changed || 0) !== 1 || Number(outcome?.auditId || 0) <= 0) {
    throw createError({ statusCode: 409, message: 'No se confirmó el ajuste. Otro pago o cambio pudo haber ocurrido. Actualiza el estado de cuenta.' })
  }

  const auditId = Number(outcome.auditId)
  console.info('[DocumentAmount] Correction committed', {
    documento, auditId, requestId, actor, before: actualMoney, after: montoFinal,
    periods: Number(outcome.periods || 0),
  })
  const message = [
    'Aurora · Corrección de importe de documento',
    `Usuario: ${actor}`,
    `Documento: ${documento} · Matrícula: ${preview.matricula}`,
    `Concepto: ${preview.conceptoNombre} · Ciclo: ${preview.ciclo}`,
    `Importe anterior: $${actualMoney.toFixed(2)} → nuevo: $${montoFinal.toFixed(2)}`,
    `Meses afectados: ${preview.affectedMonths} · Pago máximo mensual: $${preview.minimumAllowed.toFixed(2)}`,
    `Motivo: ${motivo} · ${detalle}`,
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
    pagoMaximoMensual: preview.minimumAllowed, periodosActualizados: Number(outcome.periods || 0),
    auditId, notification: { delivered: notification.delivered },
  }
}))
