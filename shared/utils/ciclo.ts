export type CicloInput = unknown

const SCHOOL_YEAR_ROLLOVER_MONTH = 7

const firstValue = (value: CicloInput): string => {
  if (Array.isArray(value)) return firstValue(value[0])
  return value === null || value === undefined ? '' : String(value).trim()
}

export const automaticSchoolCycleKey = (reference = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(reference)
  const year = Number(parts.find((part) => part.type === 'year')?.value || reference.getUTCFullYear())
  const month = Number(parts.find((part) => part.type === 'month')?.value || (reference.getUTCMonth() + 1))
  return String(month >= SCHOOL_YEAR_ROLLOVER_MONTH ? year : year - 1)
}

export const normalizeCicloKey = (value: CicloInput, fallback: string = automaticSchoolCycleKey()): string => {
  const raw = firstValue(value)
  const fallbackKey = firstValue(fallback).match(/\d{4}/)?.[0] || automaticSchoolCycleKey()
  if (!raw) return fallbackKey

  return raw.match(/\d{4}/)?.[0] || fallbackKey
}

export const formatCicloLabel = (value: CicloInput): string => {
  const key = normalizeCicloKey(value)
  return `${key}-${Number(key) + 1}`
}

export const isSameCiclo = (left: CicloInput, right: CicloInput): boolean => {
  return normalizeCicloKey(left) === normalizeCicloKey(right)
}
