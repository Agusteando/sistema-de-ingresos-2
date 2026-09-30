const TRUE_EVENTUAL_VALUES = new Set(['1', 'true', 'si', 'sí', 'yes', 'on'])

export const isEventualConcept = (value: unknown): boolean => {
  if (value === true || value === 1) return true
  if (value === false || value === 0 || value === null || value === undefined) return false
  return TRUE_EVENTUAL_VALUES.has(String(value).trim().toLowerCase())
}

export const normalizeEventualFlag = (value: unknown): 0 | 1 =>
  isEventualConcept(value) ? 1 : 0
