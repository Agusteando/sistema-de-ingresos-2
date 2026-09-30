export const SCHOOL_MONTH_LABELS = [
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
] as const

const normalizeMonthNumbers = (values: unknown[]) => Array.from(new Set(
  values
    .map((value) => Number.parseInt(String(value ?? '').trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
)).sort((a, b) => a - b)

const isTruthyConceptFlag = (value: unknown) =>
  ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())

/**
 * Canonical financial meaning of conceptos.plazo:
 * - plazo = 1 (or [1]) => eventual / one-time charge
 * - any other configured plazo => recurring concept
 *
 * eventual is only a legacy fallback when plazo is missing.
 */
export const isEventualConceptPlazo = (plazoRaw: unknown, fallbackEventual: unknown = false): boolean => {
  if (Array.isArray(plazoRaw)) {
    const parsed = normalizeMonthNumbers(plazoRaw)
    return parsed.length ? parsed.length === 1 && parsed[0] === 1 : isTruthyConceptFlag(fallbackEventual)
  }

  const raw = String(plazoRaw ?? '').trim()
  if (!raw) return isTruthyConceptFlag(fallbackEventual)

  if (raw.startsWith('[')) {
    try {
      const decoded = JSON.parse(raw)
      if (Array.isArray(decoded)) {
        const parsed = normalizeMonthNumbers(decoded)
        if (parsed.length) return parsed.length === 1 && parsed[0] === 1
      }
    } catch {
      // Fall through to legacy scalar parsing.
    }
  }

  if (raw.includes(',')) {
    const parsed = normalizeMonthNumbers(raw.split(','))
    if (parsed.length) return parsed.length === 1 && parsed[0] === 1
  }

  const numeric = Number(raw)
  return Number.isFinite(numeric) && numeric === 1
}

export const parseDocumentMonths = (plazoRaw: unknown, mesesRaw: unknown = 1): number[] => {
  const source = plazoRaw !== undefined && plazoRaw !== null && String(plazoRaw).trim() !== ''
    ? plazoRaw
    : mesesRaw

  if (Array.isArray(source)) {
    const parsed = normalizeMonthNumbers(source)
    return parsed.length ? parsed : [1]
  }

  const raw = String(source ?? '').trim()
  if (!raw) return [1]

  if (raw.startsWith('[')) {
    try {
      const decoded = JSON.parse(raw)
      if (Array.isArray(decoded)) {
        const parsed = normalizeMonthNumbers(decoded)
        if (parsed.length) return parsed
      }
    } catch {
      // Fall through to legacy parsing.
    }
  }

  if (raw.includes(',')) {
    const parsed = normalizeMonthNumbers(raw.split(','))
    if (parsed.length) return parsed
  }

  const count = Math.min(12, Math.max(1, Number.parseInt(raw, 10) || 1))
  return Array.from({ length: count }, (_, index) => index + 1)
}

export const documentMonthsFromStart = (months: unknown[], startMonth: unknown): number[] => {
  const normalized = normalizeMonthNumbers(months)
  if (!normalized.length) return [1]

  const requested = Number.parseInt(String(startMonth ?? '').trim(), 10)
  if (!Number.isInteger(requested) || !normalized.includes(requested)) return [...normalized]

  const startIndex = normalized.indexOf(requested)
  return normalized.slice(startIndex)
}

export const schoolMonthLabel = (month: unknown) => {
  const value = Number.parseInt(String(month ?? '').trim(), 10)
  return SCHOOL_MONTH_LABELS[value - 1] || `Mensualidad ${value || 1}`
}

export const serializeDocumentMonths = (months: unknown[]) =>
  normalizeMonthNumbers(months).join(',')
