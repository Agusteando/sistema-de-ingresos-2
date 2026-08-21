export const normalizePaymentTargetMonth = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ev') return 1

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export const paymentTargetKey = (value: { documento?: unknown; mes?: unknown } | null | undefined) => {
  const documento = Number(value?.documento || 0)
  return `${documento}:${normalizePaymentTargetMonth(value?.mes)}`
}

export const dedupePaymentTargets = <T extends { documento?: unknown; mes?: unknown }>(rows: T[] = []) => {
  const unique = new Map<string, T>()

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = paymentTargetKey(row)
    if (!unique.has(key)) unique.set(key, row)
  }

  return Array.from(unique.values())
}
