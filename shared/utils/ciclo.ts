export type CicloInput = string | number | null | undefined | string[] | number[]

const DEFAULT_CICLO_KEY = '2025'

const firstValue = (value: CicloInput): string => {
  if (Array.isArray(value)) return firstValue(value[0] as string | number | null | undefined)
  return value === null || value === undefined ? '' : String(value).trim()
}

export const normalizeCicloKey = (value: CicloInput, fallback: string = DEFAULT_CICLO_KEY): string => {
  const raw = firstValue(value)
  const fallbackKey = firstValue(fallback).match(/\d{4}/)?.[0] || DEFAULT_CICLO_KEY
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
