import dayjs from 'dayjs'
import { paymentPayloadDigest, paymentRowReference, validPaymentAttemptId, newPaymentAttemptId } from '../../utils/payment-attempt-id.mjs'
import { readPaymentAttempt } from '../../utils/payment-attempts'
import { runWithBridgeAgentId, executeStatementTransaction, query, type SqlStatement } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'
import { resolvePaymentConceptSnapshot } from '../../utils/payment-concept'
import { automaticSchoolCycleKey, normalizeCicloKey } from '../../../shared/utils/ciclo'
import { institutionFlagForPlantel } from '../../../shared/utils/institution'
import { isWholeMoney, parseNullableMoney } from '../../utils/monto-final'
import { PLANTELES_LIST } from '../../../utils/constants'
import { finalizeStockReservation, releaseStockReservation, reserveStockForPayment, type StockReservation } from '../../utils/conceptos-stock'
import { isPlaceholderConceptName, resolveFinancialConcept } from '../../utils/financial-concept'
import { loadActiveCobranzaConvention } from '../../utils/cobranza-convenio'
import { canRemoveLateFee, resolveLateFeeBalance } from '../../../shared/utils/recargo'
import { loadGlobalRecargoSettings, loadRecargoPolicies, type RecargoPolicy } from '../../utils/recargo-config'
import { paymentTargetKey } from '../../../shared/utils/paymentTarget'
import { parseDocumentMonths } from '../../../shared/utils/documentMonths'
import {
  formatMexicoCityDateKeyFromUnix,
  formatMexicoCityDateTimeFromUnix,
  mexicoCityDateTimeToUnix,
} from '../../utils/payment-time'

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

export default defineEventHandler(async (event) => {
  const paymentAttemptRef = validPaymentAttemptId(getHeader(event, 'x-payment-attempt')) || newPaymentAttemptId()
  try {
    return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = automaticSchoolCycleKey(), fechaPago } = body
  const pagoRealizadoEnOtroPlantel = truthyFlag(body.pagoRealizadoEnOtroPlantel)
  const plantelPago = String(body.plantelPago || '').trim().toUpperCase()
  const cicloKey = normalizeCicloKey(ciclo)
  const requestedPaymentDate = normalizePaymentDate(fechaPago)
  const user = event.context.user
  const attemptDigest = paymentPayloadDigest(body)

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

  const priorAttempt = await readPaymentAttempt(paymentAttemptRef, matricula, attemptDigest)
  if (priorAttempt.status === 'confirmed') {
    console.info('[Payments] Confirmed attempt replay', { reference: paymentAttemptRef, count: priorAttempt.folios.length })
    return { success: true, status: 'confirmed', folios: priorAttempt.folios, recovered: true }
  }
  if (priorAttempt.status !== 'missing') {
    throw createError({ statusCode: 409, message: 'Este cobro ya fue procesado y no puede registrarse otra vez.' })
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
  // Epoch time is the only stable clock contract across direct MySQL and Bridge.
  // MySQL TIMESTAMP values are session-timezone aware; formatted NOW()/DATE() strings
  // are not, which used to move evening payments into the following cash-box day.
  const [dbClock] = await query<any[]>(`
    SELECT UNIX_TIMESTAMP() AS currentUnix
  `)
  const originalUnix = Number(dbClock?.currentUnix || Math.floor(Date.now() / 1000))
  const originalTimestamp = formatMexicoCityDateTimeFromUnix(originalUnix)
  const originalDateKey = formatMexicoCityDateKeyFromUnix(originalUnix)
  // Recargo removal is governed by the real server day in Mexico City unless
  // the explicit global override is enabled. The editable payment date never
  // changes this permission.
  const globalRecargoSettings = await loadGlobalRecargoSettings()
  const canRemoveRecargo = canRemoveLateFee({
    roles: user?.roles || user?.role,
    financialPlanteles: user?.financialPlantelesList || user?.financialPlanteles,
    currentDateValue: originalDateKey,
    allowAnyTime: globalRecargoSettings.allowRemovalAnyTime,
  })
  const originalTime = originalTimestamp.slice(11, 19) || '00:00:00'
  const effectiveUnix = requestedPaymentDate
    ? mexicoCityDateTimeToUnix(requestedPaymentDate, originalTime)
    : originalUnix
  const effectiveTimestamp = formatMexicoCityDateTimeFromUnix(effectiveUnix)
  const effectiveDateKey = formatMexicoCityDateKeyFromUnix(effectiveUnix)
  const paymentDateChanged = Boolean(requestedPaymentDate && requestedPaymentDate !== originalDateKey)
  const paymentDateChangedBy = paymentDateChanged ? (user?.name || user?.email || 'Sistema') : null
  const activeConvention = await loadActiveCobranzaConvention({
    matricula,
    ciclo: cicloKey,
    currentDate: effectiveDateKey
  })

  const userName = user?.name || user?.email || 'Sistema'
  const effectivePaymentMethod = formaDePago

  // Lock the student BEFORE evaluating any conditional insert in the payment transaction.
  // MySQL/InnoDB serializes concurrent requests with the same attempt across app instances.
  const statements: SqlStatement[] = [
    { sql: 'SELECT matricula FROM base WHERE matricula = ? FOR UPDATE', params: [matricula] }
  ]
  const stockReservations: StockReservation[] = []
  const paymentStockReservations: StockReservation[] = []
  const paymentFolioResultRefs: Array<{ selectIndex: number }> = []
  const paymentRowReferences: string[] = []
  const finalAmountByTarget = new Map<string, number>()
  const resolvedPaymentConcepts = new Map<string, { concepto: string; conceptoNombre: string; eventual: boolean }>()
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
    if (!truthyFlag(doc.eventual)) {
      const applicableMonths = parseDocumentMonths(doc.plazo, doc.meses)
      if (!applicableMonths.includes(mesNumber)) {
        throw createError({
          statusCode: 409,
          message: 'El pago apunta a un mes que no pertenece a este documento.'
        })
      }
    }

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
    const conceptCacheKey = `${normalizeCicloKey(doc.ciclo || cicloKey)}:${storedPaymentConcept.concepto}`
    let catalogConcept = resolvedPaymentConcepts.get(conceptCacheKey)
    if (!catalogConcept) {
      const resolvedConcept = await resolveFinancialConcept({
        conceptoId: storedPaymentConcept.concepto,
        ciclo: doc.ciclo || cicloKey,
      })
      catalogConcept = {
        concepto: String(resolvedConcept.id),
        conceptoNombre: resolvedConcept.concepto,
        eventual: Boolean(resolvedConcept.eventual),
      }
      resolvedPaymentConcepts.set(conceptCacheKey, catalogConcept)
    }
    const paymentConcept = {
      concepto: storedPaymentConcept.concepto,
      conceptoNombre: isPlaceholderConceptName(storedPaymentConcept.conceptoNombre)
        ? catalogConcept.conceptoNombre
        : storedPaymentConcept.conceptoNombre,
      eventual: catalogConcept.eventual,
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
    const isEventual = truthyFlag(doc.eventual) || Boolean(paymentConcept.eventual)
    const omitLateFeeRequested = truthyFlag(p?.omitirRecargo)
    const applyLateFeeRequested = truthyFlag(p?.aplicarRecargo) || truthyFlag(p?.forzarRecargo)

    if (applyLateFeeRequested && isEventual) {
      throw createError({ statusCode: 400, message: 'Los conceptos eventuales no admiten recargos.' })
    }
    if (omitLateFeeRequested && !isEventual && !canRemoveRecargo) {
      throw createError({
        statusCode: 403,
        message: 'No está permitido quitar este recargo en este momento.',
      })
    }

    const applyLateFeeNow = !isEventual && applyLateFeeRequested
    let recargoPolicy = recargoPolicyCache.get(conceptoId)
    if (!recargoPolicy) {
      const policies = await loadRecargoPolicies([conceptoId])
      recargoPolicy = policies.get(conceptoId)
      if (recargoPolicy) recargoPolicyCache.set(conceptoId, recargoPolicy)
    }

    const hasRecargoManual = !isEventual && pagosDelMes.some(row => String(row.recargo) === '1')
    const hasPayment = pagosDelMes.some(row => Number(row.monto || 0) > 0)
    const omitLateFeeNow = !isEventual && omitLateFeeRequested && canRemoveRecargo
    const lateFee = resolveLateFeeBalance({
      baseAmount: finalAmount,
      paidAmount: resuelto,
      eligible: !isEventual,
      enabled: !isEventual && Boolean(recargoPolicy?.activo),
      force: applyLateFeeNow,
      suppress: omitLateFeeNow,
      hasManualLateFee: hasRecargoManual,
      hasPayment,
      hasActiveConvention: Boolean(activeConvention),
      ciclo: cicloKey,
      schoolMonth: mesNumber,
      currentDateValue: effectiveDateKey,
      cutoffDay: recargoPolicy?.diaLimite ?? 12,
      isService: false,
      percentage: recargoPolicy?.porcentaje ?? 10,
    })
    const appliesLateFee = lateFee.appliesLateFee
    subtotal = lateFee.subtotal
    saldoAntes = lateFee.balance

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
          idempotencyKey: `payment:${paymentAttemptRef}:${stockReservations.length}:${Date.now()}:${Math.random().toString(36).slice(2)}`
        })
      : { controlled: false, source: 'bridge' as const, concepto_id: stockConceptoId, plantel, quantity: 0 }
    stockReservations.push(stockReservation)
    paymentStockReservations.push(stockReservation)

    const rowReference = paymentRowReference(paymentAttemptRef, attemptDigest, paymentRowReferences.length)
    paymentRowReferences.push(rowReference)
    const montoDecimal = Number(requestedAmount.toFixed(2))
    const letra = numeroALetras(montoDecimal)
    // Lock and recheck the exact coverage at commit time, after any concurrent start adjustment.
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
          fecha_modificada_por,
          referencia
        ) SELECT ?, (SELECT documento FROM documentos WHERE documento = ? AND plazo <=> ? AND meses <=> ? AND montoFinal <=> ? AND estatus = 'Activo' FOR UPDATE), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?
        FROM (SELECT 1 AS commit_guard) AS payment_guard
        LEFT JOIN referenciasdepago AS exact_attempt ON exact_attempt.referencia = ?
        LEFT JOIN referenciasdepago AS mismatched_attempt
          ON mismatched_attempt.referencia LIKE ? AND mismatched_attempt.referencia NOT LIKE ?
        WHERE exact_attempt.folio IS NULL AND mismatched_attempt.folio IS NULL
      `,
      params: [
        matricula,
        documento,
        doc.plazo,
        doc.meses,
        // The same transaction may have filled an initially NULL montoFinal
        // immediately before this insert. Expect that committed value instead
        // of the stale value read when composing payment statements.
        doc.montoFinal == null && !periodIsChangedConcept ? finalAmount : doc.montoFinal,
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
        pagoRealizadoEnOtroPlantel ? originalUnix : null,
        pagoRealizadoEnOtroPlantel ? 1 : 0,
        pagoRealizadoEnOtroPlantel ? plantelPago : null,
        stockReservation.controlled ? 1 : 0,
        stockReservation.controlled ? stockReservation.source : null,
        stockReservation.controlled ? stockReservation.concepto_id : null,
        stockReservation.controlled ? stockReservation.plantel : null,
        stockReservation.controlled ? stockReservation.quantity : 0,
        stockReservation.controlled ? stockReservation.movement_id || null : null,
        effectiveUnix,
        originalUnix,
        paymentDateChanged ? originalUnix : null,
        paymentDateChangedBy,
        rowReference,
        rowReference,
        `${paymentAttemptRef}:%`,
        `${paymentAttemptRef}:${attemptDigest}:%`
      ]
    })

    // Always recover by the exact durable row reference, including repeated requests.
    // LAST_INSERT_ID and 'latest payment' are unsafe when the response is lost.
    const paymentFolioSelectIndex = statements.length
    statements.push({
      sql: 'SELECT folio, stock_movement_id FROM referenciasdepago WHERE referencia = ? LIMIT 1',
      params: [rowReference]
    })
    paymentFolioResultRefs.push({ selectIndex: paymentFolioSelectIndex })
  }
  } catch (error) {
    await Promise.all(stockReservations.map((reservation) => releaseStockReservation(reservation, 'Pago no confirmado por validación fallida')))
    throw error
  }

  if (!statements.some(statement => /INSERT INTO referenciasdepago/i.test(statement.sql))) {
    throw createError({ statusCode: 400, message: 'No hay pagos validos para registrar.' })
  }

  let results: any[] = []
  let persistedRows: Array<{ folio: number; stock_movement_id?: number | null }> = []
  const recoverCommitted = async () => {
    const attempt = await readPaymentAttempt(paymentAttemptRef, matricula, attemptDigest)
    if (attempt.status === 'conflict' || attempt.status === 'cancelled') {
      throw createError({ statusCode: 409, message: 'Este cobro ya fue procesado y no puede registrarse otra vez.' })
    }
    if (attempt.status === 'confirmed' && attempt.folios.length === paymentRowReferences.length) {
      return attempt.rows
    }
    return null
  }

  try {
    results = await executeStatementTransaction<any>(statements)
    persistedRows = paymentFolioResultRefs.map(({ selectIndex }) => {
      const selected = results[selectIndex]
      return (Array.isArray(selected) ? selected[0] : selected) || { folio: 0 }
    })
  } catch (error) {
    // An SQL rejection is a known rollback. A lost bridge response is NOT.
    // Never compensate inventory for a transaction whose commit is uncertain.
    const code = String((error as any)?.code || '')
    const definitelyRolledBack = /^ER_/.test(code)
    if (definitelyRolledBack) {
      await Promise.all(stockReservations.map(reservation => releaseStockReservation(reservation, 'Transacción rechazada')))
      if (code === 'ER_BAD_NULL_ERROR' && /documento/i.test(String((error as any)?.message || ''))) {
        throw createError({ statusCode: 409, message: 'La tira cambió. Actualiza el estado de cuenta.' })
      }
      throw error
    }
    try {
      const recovered = await recoverCommitted()
      if (recovered) persistedRows = recovered
    } catch (lookupError: any) {
      if (Number(lookupError?.statusCode || 0) === 409) throw lookupError
      console.warn('[Payments] Confirmation lookup unavailable', { reference: paymentAttemptRef, code: lookupError?.code })
    }
    if (!persistedRows.length) {
      console.warn('[Payments] Uncertain transaction retained for safe reconciliation', { reference: paymentAttemptRef, matricula })
      return { success: false, status: 'processing', reference: paymentAttemptRef }
    }
  }

  let resultFolios = persistedRows.map(row => Number(row?.folio || 0))
  if (resultFolios.length !== paymentRowReferences.length || resultFolios.some(folio => !Number.isInteger(folio) || folio <= 0)) {
    try {
      const recovered = await recoverCommitted()
      if (recovered) {
        persistedRows = recovered
        resultFolios = recovered.map(row => Number(row.folio))
      }
    } catch (lookupError: any) {
      if (Number(lookupError?.statusCode || 0) === 409) throw lookupError
      console.warn('[Payments] Receipt lookup unavailable', { reference: paymentAttemptRef, code: lookupError?.code })
    }
  }
  if (resultFolios.length !== paymentRowReferences.length || resultFolios.some(folio => !folio)) {
    console.error('[Payments] Committed attempt has no complete receipt result', { reference: paymentAttemptRef })
    return { success: false, status: 'processing', reference: paymentAttemptRef }
  }

  // On a serialized replay, the original movement belongs to the payment.
  // Compensate ONLY the second request's independent stock reservation.
  await Promise.all(paymentStockReservations.map(async (reservation, index) => {
    const persistedMovement = Number(persistedRows[index]?.stock_movement_id || 0)
    const currentMovement = Number(reservation.movement_id || 0)
    if (reservation.controlled && currentMovement && persistedMovement !== currentMovement) {
      await releaseStockReservation(reservation, 'Reserva duplicada de un intento confirmado')
      return
    }
    await finalizeStockReservation(reservation, resultFolios[index])
  }))

  return {
    success: true,
    status: 'confirmed',
    folios: resultFolios,
    fechaEfectiva: effectiveTimestamp,
    fechaOriginal: originalTimestamp,
    fechaAjustada: paymentDateChanged,
    pagoRealizadoEnOtroPlantel,
    plantelPago: pagoRealizadoEnOtroPlantel ? plantelPago : null
  }
  })
  } catch (error) {
    console.error('[Payments] Payment submission rejected or failed', {
      reference: paymentAttemptRef,
      statusCode: Number((error as any)?.statusCode || 500),
      code: String((error as any)?.code || 'unknown').slice(0, 80)
    })
    throw error
  }
})
