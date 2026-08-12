export type PaymentAuditRow = {
  estatus?: unknown
  depurado?: unknown
  formaDePago?: unknown
  pago_otro_plantel?: unknown
  monto?: unknown
}

// Shared payment-ledger semantics used by Corte de caja and Reporte por concepto.
// In bridge mode the agent database is already the physical cash-box perimeter, so callers
// may intentionally skip filtering on this derived plantel when the active agent owns scope.
export const PAYMENT_PLANTEL_SQL = `CASE
  WHEN COALESCE(r.pago_otro_plantel, 0) = 1
    AND NULLIF(TRIM(r.plantel_pago), '') IS NOT NULL
    THEN UPPER(TRIM(r.plantel_pago))
  ELSE UPPER(COALESCE(
    NULLIF(TRIM(r.plantel), ''),
    NULLIF(TRIM(A.plantel), ''),
    NULLIF(TRIM(r.plantel_pago), '')
  ))
END`

export const PAYMENT_REGISTERED_AT_SQL = 'COALESCE(r.fecha_original, r.fecha)'
export const PAYMENT_EFFECTIVE_AT_SQL = 'r.fecha'

export const PAYMENT_CANCELED_STATUS_SQL = `LOWER(TRIM(COALESCE(CAST(r.estatus AS CHAR), ''))) IN (
  'cancelada', 'cancelado', 'cancelled', 'canceled'
)`

export const PAYMENT_DEPURATION_ADJUSTMENT_SQL = `(
  COALESCE(r.depurado, 0) = 1
  AND LOWER(TRIM(COALESCE(r.formaDePago, ''))) IN ('depuracion', 'depuración')
  AND COALESCE(r.pago_otro_plantel, 0) = 0
)`

export const PAYMENT_APPLIED_AMOUNT_SQL = `CASE
  WHEN ${PAYMENT_CANCELED_STATUS_SQL} THEN 0
  WHEN ${PAYMENT_DEPURATION_ADJUSTMENT_SQL} THEN 0
  ELSE COALESCE(r.monto, 0)
END`

const normalizeText = (value: unknown) => String(value || '').trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

export const isCanceledPayment = (row: PaymentAuditRow) => {
  const status = normalizeText(row.estatus)
  return ['cancelada', 'cancelado', 'cancelled', 'canceled'].includes(status)
}

export const isDepurationAdjustment = (row: PaymentAuditRow) => {
  const depurado = ['1', 'true'].includes(String(row.depurado ?? '').trim().toLowerCase())
  const otherCampus = ['1', 'true'].includes(String(row.pago_otro_plantel ?? '').trim().toLowerCase())
  return depurado && normalizeText(row.formaDePago) === 'depuracion' && !otherCampus
}

export const resolvePaymentAuditStatus = (row: PaymentAuditRow) => {
  if (isCanceledPayment(row)) return 'Cancelado'
  if (isDepurationAdjustment(row)) return 'Depuración'
  return String(row.estatus || 'Vigente').trim() || 'Vigente'
}

export const resolvePaymentAppliedAmount = (row: PaymentAuditRow) => {
  if (isCanceledPayment(row) || isDepurationAdjustment(row)) return 0
  return Number(row.monto || 0)
}
