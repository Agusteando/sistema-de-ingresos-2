const stringifyScalar = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(stringifyScalar).filter(Boolean).join(' / ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['label', 'nombre', 'name', 'value', 'id', 'key', 'text', 'title']) {
      const text = stringifyScalar(record[key]).trim()
      if (text) return text
    }
    return ''
  }
  return ''
}

export const FAMILY_ID_PLACEHOLDER_VALUES = [
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  'sin dato',
  'sin datos',
  's/d',
  'sd',
  '-',
  '--',
  '0',
]

const FAMILY_ID_PLACEHOLDERS = new Set(FAMILY_ID_PLACEHOLDER_VALUES)

export const normalizeFamilyId = (value: unknown, maxLength = 255) => {
  const text = stringifyScalar(value)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim()

  if (!text) return ''

  const normalized = text.replace(/\s+/g, ' ').slice(0, maxLength)
  const lowered = normalized.toLowerCase()

  if (FAMILY_ID_PLACEHOLDERS.has(lowered)) return ''
  return normalized
}

export const hasUsableFamilyId = (value: unknown) => Boolean(normalizeFamilyId(value))

export const normalizeFamilyLinkKey = (value: unknown, maxLength = 255) => {
  const text = stringifyScalar(value).trim()
  if (!text) return ''

  const separator = text.indexOf(':')
  if (separator === -1) return normalizeFamilyId(text, maxLength)

  const source = text.slice(0, separator).trim().toLowerCase()
  const familyId = normalizeFamilyId(text.slice(separator + 1), maxLength)

  if (!familyId) return ''
  return source ? `${source}:${familyId}` : familyId
}

export const buildFamilyLinkKey = (source: string, value: unknown, maxLength = 255) => {
  const familyId = normalizeFamilyId(value, maxLength)
  const normalizedSource = String(source || '').trim().toLowerCase()
  if (!familyId || !normalizedSource) return ''
  return `${normalizedSource}:${familyId}`
}
