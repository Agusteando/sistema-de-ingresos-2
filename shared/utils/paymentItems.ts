export const paymentStatusKey = (value: unknown) =>
  String(value || '').trim().toLowerCase()

export const isPaymentCancelled = (payment: Record<string, unknown> | null | undefined) =>
  ['cancelada', 'cancelado'].includes(paymentStatusKey(payment?.estatus))

export const paymentItemKey = (item: any) => {
  const folio = Number(item?.payment?.folio)
  if (Number.isInteger(folio) && folio > 0) return `folio:${folio}`

  return [
    'payment',
    item?.debt?.documento || item?.payment?.documento || '',
    item?.payment?.mes || item?.debt?.mes || '',
    item?.payment?.fecha || '',
    item?.payment?.monto || '',
  ].join(':')
}

export const paymentConceptLabel = (item: any) =>
  item?.payment?.conceptoNombre ||
  item?.debt?.conceptoNombre ||
  'Concepto financiero'

export const paymentPeriodLabel = (item: any) =>
  item?.debt?.mesLabel ||
  item?.payment?.mesReal ||
  item?.payment?.mes ||
  'Cargo'

export const buildPaymentItems = (debts: any[] = []) => {
  const rowsByKey = new Map<string, any>()

  for (const debt of Array.isArray(debts) ? debts : []) {
    for (const payment of debt?.historialPagos || []) {
      const candidate = {
        debt,
        debts: [debt],
        payment,
        cancelled: isPaymentCancelled(payment),
      }
      const key = paymentItemKey(candidate)
      const existing = rowsByKey.get(key)

      if (existing) {
        existing.debts.push(debt)
        continue
      }

      rowsByKey.set(key, candidate)
    }
  }

  return Array.from(rowsByKey.values()).sort((a, b) => {
    const aDate = new Date(a.payment?.fecha || a.payment?.fecha_original || 0).getTime() || 0
    const bDate = new Date(b.payment?.fecha || b.payment?.fecha_original || 0).getTime() || 0
    if (aDate !== bDate) return bDate - aDate
    return Number(b.payment?.folio || 0) - Number(a.payment?.folio || 0)
  })
}
