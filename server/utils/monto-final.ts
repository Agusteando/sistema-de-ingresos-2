export const parseNullableMoney = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const isWholeMoney = (value: unknown): boolean => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && Math.floor(parsed) === parsed
}

export const legacyProjectedAmount = (cost: unknown, beca: unknown): number => {
  const baseCost = Number(cost || 0)
  const becaPct = Number(beca || 0)
  return ((100 - becaPct) * baseCost) / 100
}

export const resolveProjectedAmount = (doc: any, activePeriod?: any) => {
  const periodIsChangedConcept = activePeriod?.accion === 'cambio'
  const periodFinal = parseNullableMoney(activePeriod?.montoFinal)
  const docFinal = parseNullableMoney(doc?.montoFinal)
  const baseCost = activePeriod?.costo != null ? Number(activePeriod.costo || 0) : Number(doc?.costo || 0)

  if (periodIsChangedConcept) {
    if (periodFinal !== null) {
      return { amount: periodFinal, source: 'period', pending: false, baseCost }
    }
    return {
      amount: legacyProjectedAmount(baseCost, doc?.beca),
      source: 'legacy-period',
      pending: true,
      baseCost
    }
  }

  if (docFinal !== null) {
    return { amount: docFinal, source: 'documento', pending: false, baseCost }
  }

  return {
    amount: legacyProjectedAmount(baseCost, doc?.beca),
    source: 'legacy-documento',
    pending: true,
    baseCost
  }
}
