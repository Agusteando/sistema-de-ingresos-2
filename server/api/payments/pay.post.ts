import dayjs from 'dayjs'
import { runWithBridgeAgentId, executeStatementTransaction, query, type SqlStatement } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'
import { resolvePaymentConceptSnapshot } from '../../utils/payment-concept'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { institutionFlagForPlantel } from '../../../shared/utils/institution'
import { isWholeMoney, parseNullableMoney } from '../../utils/monto-final'
import { PLANTELES_LIST } from '../../../utils/constants'
import { finalizeStockReservation, releaseStockReservation, reserveStockForPayment, type StockReservation } from '../../utils/conceptos-stock'
import { isPlaceholderConceptName, resolveFinancialConcept } from '../../utils/financial-concept'
import { loadActiveCobranzaConvention } from '../../utils/cobranza-convenio'
import {
  resolveLateFeeTiming,
  shouldApplyLateFee,
} from '../../utils/cobranza-period'
import { calculateLateFeeSubtotal } from '../../../shared/utils/recargo'
import { loadRecargoPolicies, markRecargoConceptAsService, type RecargoPolicy } from '../../utils/recargo-config'
import { paymentTargetKey } from '../../../shared/utils/paymentTarget'

const truthyFlag = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())

const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const ALLOWED_PAYMENT_METHODS = new Set([
  'Efectivo',
  'Tarjeta de débito',
  'Tarjeta de crédito',
  'Transferencia',
  'Cheque'
])

const toMesNumber = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ev') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const normalizePaymentDate = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw createError({ statusCode: 400, message: 'La fecha del pago no es válida.' })
  }

  const parsed = dayjs(`${raw}T12:00:00`)
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== raw) {
    throw createError({ statusCode: 400, message: 'La fecha del pago no es válida.' })
  }

  return raw
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2025', fechaPago } = body
  const pagoRealizadoEnOtroPlantel = truthyFlag(body.pagoRealizadoEnOtroPlantel)
  const plantelPago = String(body.plantelPago || '').trim().toUpperCase()
  const cicloKey = normalizeCicloKey(ciclo)
  const requestedPaymentDate = normalizePaymentDate(fechaPago)
  const user = event.context.user

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, message: 'Faltan parámetros obligatorios.' })
  }

  if (normalizePaymentMethod(formaDePago) === 'depuracion') {
    throw createError({ statusCode: 400, message: 'La depuración requiere autorización por código.' })
  }

  if (!ALLOWED_PAYMENT_METHODS.has(String(formaDePago || ''))) {
    throw createError({ statusCode: 400, message: 'Selecciona un método de pago válido.' })
  }


  if (pagoRealizadoEnOtroPlantel) {
    if (!plantelPago || !PLANTELES_LIST.includes(plantelPago)) {
      throw createError({ statusCode: 400, message: 'Selecciona el plantel donde se realizó el pago.' })
    }

    const activePlantel = String(event.context.dbBridgeAgentId || user?.active_plantel || '').trim().toUpperCase()
    if (PLANTELES_LIST.includes(activePlantel) && plantelPago === activePlantel) {
      throw createError({ statusCode: 400, message: 'Ese plantel es el plantel activo. Registra el pago como pago normal.' })
    }
  }

  const [studentRef] = await query<any[]>(
    `SELECT nombreCompleto, plantel FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const nombreCompleto = studentRef.nombreCompleto
  const plantel = studentRef.plantel || 'PT'

  const instituto = institutionFlagForPlantel(plantel)
  const [dbClock] = await query<any[]>(`
    SELECT
      DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS currentTimestamp,
      DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS currentDate
  `)
  const originalTimestamp = String(dbClock?.currentTimestamp || dayjs().format('YYYY-MM-DD HH:mm:ss'))
  const originalDateKey = String(dbClock?.currentDate || originalTimestamp.slice(0, 10))
  const originalTime = originalTimestamp.slice(11, 19) || '00:00:00'
  const effectiveTimestamp = requestedPaymentDate
    ? `${requestedPaymentDate} ${originalTime}`
    : originalTimestamp
  const effectiveDateKey = requestedPaymentDate || originalDateKey
  const paymentDateChanged = Boolean(requestedPaymentDate && requestedPaymentDate !== originalDateKey)
  const paymentDateChangedBy = paymentDateChanged ? (user?.name || user?.email || 'Sistema') : null
  const activeConvention = await loadActiveCobranzaConvention({
    matricula,
    ciclo: cicloKey,
    currentDate: effectiveDateKey
  })

  const userName = user?.name || user?.email || 'Sistema'
  const effectivePaymentMethod = formaDePago

  const statements: SqlStatement[] = []
  const stockReservations: StockReservation[] = []
  const paymentStockReservations: StockReservation[] = []
  const paymentFolioResultRefs: Array<{ insertIndex: number; selectIndex: number }> = []
  const paymentReceiptRecoveryKeys: Array<{ documento: number; mes: string; monto: number }> = []
  const finalAmountByTarget = new Map<string, number>()
  const resolvedPaymentConcepts = new Map<string, { concepto: string; conceptoNombre: string }>()
  const recargoPolicyCache = new Map<number, RecargoPolicy>()
  const seenPaymentTargets = new Set<string>()

  try {
  for (const p of pagos) {
    const requestedAmountFromClient = Number(p.montoPagado || 0)
    const automaticAmount = truthyFlag(p?.montoAutomatico)
    if (!automaticAmount && requestedAmountFromClient <= 0) continue

    const documento = Number(p.documento)
    const mes = String(p.mes || '').trim()
    if (!documento || !mes) {
      throw createError({ statusCode: 400, message: 'Cada pago debe apuntar a un documento y mes.' })
    }

    const paymentDuplicateKey = paymentTargetKey({ documento, mes })
    if (seenPaymentTargets.has(paymentDuplicateKey)) {
      throw createError({
        statusCode: 409,
        message: 'El pago contiene el mismo documento y mes más de una vez. No se registró ningún cargo para evitar duplicados.'
      })
    }
    seenPaymentTargets.add(paymentDuplicateKey)

    const [doc] = await query<any[]>(`
      SELECT documento, matricula, costo, montoFinal, meses, plazo, beca, ciclo, concepto, conceptoNombre, eventual, estatus
      FROM documentos
      WHERE documento = ? AND matricula = ? AND ciclo = ? AND estatus = 'Activo'
      LIMIT 1
    `, [documento, matricula, cicloKey])

    if (!doc) {
      throw createError({ statusCode: 409, message: 'El pago contiene un documento que no existe para este alumno.' })
    }

    const mesNumber = toMesNumber(mes)
    const [period] = await query<any[]>(`
      SELECT id, documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal, accion, estatus
      FROM documento_concepto_periodos
      WHERE documento = ?
        AND estatus = 'Activo'
        AND start_mes <= ?
        AND (end_mes IS NULL OR end_mes >= ?)
      ORDER BY start_mes DESC, id DESC
      LIMIT 1
    `, [documento, mesNumber, mesNumber])

    const storedPaymentConcept = resolvePaymentConceptSnapshot(doc, period)
    let paymentConcept = storedPaymentConcept
    if (isPlaceholderConceptName(storedPaymentConcept.conceptoNombre)) {
      const conceptCacheKey = `${normalizeCicloKey(doc.ciclo || cicloKey)}:${storedPaymentConcept.concepto}`
      const cachedConcept = resolvedPaymentConcepts.get(conceptCacheKey)
      if (cachedConcept) {
        paymentConcept = cachedConcept
      } else {
        const resolvedConcept = await resolveFinancialConcept({
          conceptoId: storedPaymentConcept.concepto,
          ciclo: doc.ciclo || cicloKey,
        })
        paymentConcept = {
          concepto: String(resolvedConcept.id),
          conceptoNombre: resolvedConcept.concepto,
        }
        resolvedPaymentConcepts.set(conceptCacheKey, paymentConcept)
      }
    }

    const periodIsChangedConcept = period?.accion === 'cambio'
    const finalAmountTargetKey = periodIsChangedConcept ? `period:${period.id}` : `doc:${doc.documento}`
    let finalAmount = periodIsChangedConcept ? parseNullableMoney(period.montoFinal) : parseNullableMoney(doc.montoFinal)

    if (finalAmount === null && finalAmountByTarget.has(finalAmountTargetKey)) {
      finalAmount = finalAmountByTarget.get(finalAmountTargetKey) as number
    }

    if (finalAmount === null) {
      if (!isWholeMoney(p.montoFinal)) {
        throw createError({ statusCode: 400, message: 'Define el monto final sin decimales antes de registrar el pago.' })
      }
      finalAmount = Number(p.montoFinal)
      finalAmountByTarget.set(finalAmountTargetKey, finalAmount)
      statements.push(periodIsChangedConcept
        ? {
            sql: `UPDATE documento_concepto_periodos SET montoFinal = ? WHERE id = ? AND montoFinal IS NULL`,
            params: [finalAmount, period.id]
          }
        : {
            sql: `UPDATE documentos SET montoFinal = ? WHERE documento = ? AND montoFinal IS NULL`,
            params: [finalAmount, doc.documento]
          })
    }

    const pagosDelMes = await query<any[]>(`
      SELECT monto, recargo, formaDePago, depurado
      FROM referenciasdepago
      WHERE matricula = ?
        AND documento = ?
        AND ciclo = ?
        AND estatus = 'Vigente'
        AND (mes = ? OR mes = ?)
    `, [matricula, documento, cicloKey, mes, String(mesNumber)])

    const resuelto = pagosDelMes.reduce((sum, row) => sum + Number(row.monto || 0), 0)
    let subtotal = Number(finalAmount)
    let saldoAntes = Math.max(0, subtotal - resuelto)

    const conceptoId = Number(paymentConcept.concepto || 0)
    // forzarRecargo is accepted only as a rolling-deploy compatibility alias.
    // New clients send aplicarRecargo, whose business meaning is explicit: apply
    // the recargo now and classify the concept globally as a recargo service.
    const applyLateFeeNow = truthyFlag(p?.aplicarRecargo) || truthyFlag(p?.forzarRecargo)
    let recargoPolicy = recargoPolicyCache.get(conceptoId)
    if (!recargoPolicy) {
      const policies = await loadRecargoPolicies([conceptoId])
      recargoPolicy = policies.get(conceptoId)
      if (recargoPolicy) recargoPolicyCache.set(conceptoId, recargoPolicy)
    }

    if (applyLateFeeNow && !recargoPolicy?.esServicio) {
      recargoPolicy = await markRecargoConceptAsService({
        conceptoId,
        updatedBy: user?.email || userName,
      })
      recargoPolicyCache.set(conceptoId, recargoPolicy)
    }

    const hasRecargoManual = pagosDelMes.some(row => String(row.recargo) === '1')
    const hasPayment = pagosDelMes.some(row => Number(row.monto || 0) > 0)
    const recargoTiming = resolveLateFeeTiming({
      ciclo: cicloKey,
      schoolMonth: mesNumber,
      currentDateValue: effectiveDateKey,
      cutoffDay: recargoPolicy?.diaLimite ?? 12,
      isService: Boolean(recargoPolicy?.esServicio),
    })
    const appliesLateFee = shouldApplyLateFee({
      enabled: Boolean(recargoPolicy?.activo),
      force: applyLateFeeNow,
      hasManualLateFee: hasRecargoManual,
      hasPayment,
      hasActiveConvention: Boolean(activeConvention),
      isAfterDeadline: recargoTiming.isAfterDeadline,
      balanceBeforeLateFee: saldoAntes
    })

    if (appliesLateFee) {
      subtotal = calculateLateFeeSubtotal(finalAmount, recargoPolicy?.porcentaje ?? 10)
      saldoAntes = Math.max(0, subtotal - resuelto)
    }

    // For the default/full-balance path, the server owns the final amount.
    // This prevents a stale client projection from registering the pre-recargo
    // amount after the canonical recargo policy has already increased the debt.
    // Explicitly edited/partial amounts continue to be honored unchanged.
    const requestedAmount = automaticAmount ? saldoAntes : requestedAmountFromClient
    if (requestedAmount <= 0) continue

    if (requestedAmount > saldoAntes + 0.009) {
      throw createError({ statusCode: 400, message: 'El monto excede el saldo del documento seleccionado.' })
    }

    const stockConceptoId = Number(paymentConcept.concepto || 0)
    const shouldConsumeStock = resuelto <= 0.009
    const stockReservation = shouldConsumeStock
      ? await reserveStockForPayment({
          conceptoId: stockConceptoId,
          plantel,
          quantity: 1,
          matricula,
          documento,
          mes: mesNumber,
          userEmail: user?.email || userName,
          note: paymentConcept.conceptoNombre,
          idempotencyKey: `payment:${matricula}:${documento}:${mesNumber}:${Date.now()}:${stockReservations.length}`
        })
      : { controlled: false, source: 'bridge' as const, concepto_id: stockConceptoId, plantel, quantity: 0 }
    stockReservations.push(stockReservation)
    paymentStockReservations.push(stockReservation)

    const montoDecimal = Number(requestedAmount.toFixed(2))
    const letra = numeroALetras(montoDecimal)
    const paymentInsertIndex = statements.length
    statements.push({
      sql: `
        INSERT INTO referenciasdepago (
          matricula,
          documento,
          mes,
          mesReal,
          nombreCompleto,
          concepto,
          conceptoNombre,
          monto,
          montoLetra,
          importeTotal,
          saldoAntes,
          saldoDespues,
          pagos,
          pagosDespues,
          recargo,
          usuario,
          usuario_email,
          formaDePago,
          plantel,
          instituto,
          ciclo,
          estatus,
          depurado,
          depurado_por,
          depurado_fecha,
          pago_otro_plantel,
          plantel_pago,
          stock_controlled,
          stock_source,
          stock_concepto_id,
          stock_plantel,
          stock_quantity,
          stock_movement_id,
          fecha,
          fecha_original,
          fecha_modificada_at,
          fecha_modificada_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        matricula,
        documento,
        mes,
        p.mesLabel,
        nombreCompleto,
        paymentConcept.concepto,
        paymentConcept.conceptoNombre,
        montoDecimal,
        letra,
        subtotal,
        saldoAntes,
        Math.max(0, saldoAntes - montoDecimal),
        resuelto,
        resuelto + montoDecimal,
        subtotal > Number(finalAmount) ? 1 : 0,
        userName,
        user?.email || null,
        effectivePaymentMethod,
        plantel,
        instituto,
        cicloKey,
        'Vigente',
        pagoRealizadoEnOtroPlantel ? 1 : 0,
        pagoRealizadoEnOtroPlantel ? userName : null,
        pagoRealizadoEnOtroPlantel ? originalTimestamp : null,
        pagoRealizadoEnOtroPlantel ? 1 : 0,
        pagoRealizadoEnOtroPlantel ? plantelPago : null,
        stockReservation.controlled ? 1 : 0,
        stockReservation.controlled ? stockReservation.source : null,
        stockReservation.controlled ? stockReservation.concepto_id : null,
        stockReservation.controlled ? stockReservation.plantel : null,
        stockReservation.controlled ? stockReservation.quantity : 0,
        stockReservation.controlled ? stockReservation.movement_id || null : null,
        effectiveTimestamp,
        originalTimestamp,
        paymentDateChanged ? originalTimestamp : null,
        paymentDateChangedBy
      ]
    })

    // LAST_INSERT_ID() is read in the same transaction/connection immediately
    // after the payment insert. This is intentionally redundant with insertId:
    // some Bridge versions do not expose write metadata consistently, and the
    // receipt must never disappear after a successful payment.
    const paymentFolioSelectIndex = statements.length
    statements.push({ sql: 'SELECT LAST_INSERT_ID() AS folio' })
    paymentFolioResultRefs.push({
      insertIndex: paymentInsertIndex,
      selectIndex: paymentFolioSelectIndex,
    })
    paymentReceiptRecoveryKeys.push({ documento, mes, monto: montoDecimal })
  }
  } catch (error) {
    await Promise.all(stockReservations.map((reservation) => releaseStockReservation(reservation, 'Pago no confirmado por validación fallida')))
    throw error
  }

  if (!statements.some(statement => /INSERT INTO referenciasdepago/i.test(statement.sql))) {
    throw createError({ statusCode: 400, message: 'No hay pagos validos para registrar.' })
  }

  let results: any[] = []
  try {
    results = await executeStatementTransaction<any>(statements)
  } catch (error) {
    await Promise.all(stockReservations.map((reservation) => releaseStockReservation(reservation, 'Pago no confirmado por error transaccional')))
    throw error
  }

  const resultFolios = paymentFolioResultRefs.map(({ insertIndex, selectIndex }) => {
    const selectResult: any = results[selectIndex]
    const selectedFolio = Array.isArray(selectResult)
      ? Number(selectResult?.[0]?.folio || 0)
      : Number(selectResult?.folio || 0)
    if (Number.isInteger(selectedFolio) && selectedFolio > 0) return selectedFolio

    const insertResult: any = results[insertIndex]
    const insertedFolio = Number(insertResult?.insertId || 0)
    return Number.isInteger(insertedFolio) && insertedFolio > 0 ? insertedFolio : 0
  })

  if (resultFolios.some(folio => !folio) || resultFolios.length !== paymentStockReservations.length) {
    // The transaction has already committed at this point, so do not pretend
    // the payment failed. Recover each missing folio by the exact payment row
    // identity rather than by a broad "latest payments" query.
    const recoveredFolios: number[] = []
    for (let index = 0; index < paymentReceiptRecoveryKeys.length; index += 1) {
      const directFolio = resultFolios[index]
      if (directFolio) {
        recoveredFolios.push(directFolio)
        continue
      }

      const key = paymentReceiptRecoveryKeys[index]
      const [row] = await query<any[]>(`
        SELECT folio
        FROM referenciasdepago
        WHERE matricula = ?
          AND documento = ?
          AND mes = ?
          AND ciclo = ?
          AND fecha = ?
          AND estatus = 'Vigente'
          AND usuario = ?
          AND ABS(monto - ?) < 0.005
        ORDER BY folio DESC
        LIMIT 1
      `, [matricula, key.documento, key.mes, cicloKey, effectiveTimestamp, userName, key.monto])

      const folio = Number(row?.folio || 0)
      if (Number.isInteger(folio) && folio > 0) recoveredFolios.push(folio)
    }

    if (recoveredFolios.length === paymentStockReservations.length) {
      resultFolios.splice(0, resultFolios.length, ...recoveredFolios)
    } else {
      console.error('[Payments] Pago confirmado sin folios recuperables para recibo.', {
        matricula,
        ciclo: cicloKey,
        fecha: effectiveTimestamp,
        expected: paymentStockReservations.length,
        found: resultFolios.filter(Boolean).length,
        recovered: recoveredFolios.length,
      })
    }
  }

  await Promise.all(paymentStockReservations.map((reservation, index) => finalizeStockReservation(reservation, resultFolios[index])))

  return {
    success: true,
    folios: resultFolios,
    fechaEfectiva: effectiveTimestamp,
    fechaOriginal: originalTimestamp,
    fechaAjustada: paymentDateChanged,
    pagoRealizadoEnOtroPlantel,
    plantelPago: pagoRealizadoEnOtroPlantel ? plantelPago : null
  }
}))
