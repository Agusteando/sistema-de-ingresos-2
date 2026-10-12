// Monetary correction validation uses cents to avoid floating-point remainders.
export const amountToCents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value).trim()
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(raw)) return null
  const [whole, fractional = ''] = raw.split('.')
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export const centsToAmount = (value: number): number => Number((value / 100).toFixed(2))

export const paymentFloorCents = (monthlyPayments: Array<{ paidCents: number }>): number =>
  Math.max(0, ...monthlyPayments.map(row => Number(row.paidCents || 0)))

export const canCorrectDocumentAmount = (amount: unknown, monthlyPayments: Array<{ paidCents: number }>) => {
  const nextCents = amountToCents(amount)
  const minimumCents = paymentFloorCents(monthlyPayments)
  return {
    valid: nextCents !== null && nextCents > 0,
    allowed: nextCents !== null && nextCents > 0 && nextCents >= minimumCents,
    nextCents,
    minimumCents,
  }
}
