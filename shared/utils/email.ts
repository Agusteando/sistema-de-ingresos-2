export const MAX_EMAIL_ADDRESS_LENGTH = 254

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizeEmailAddress = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()

export const isValidEmailAddress = (
  value: unknown,
  options: { allowEmpty?: boolean } = {},
) => {
  const normalized = normalizeEmailAddress(value)
  if (!normalized) return options.allowEmpty !== false
  if (normalized.length > MAX_EMAIL_ADDRESS_LENGTH) return false
  if (normalized.includes('@casita')) return false
  return EMAIL_ADDRESS_PATTERN.test(normalized)
}

export const emailAddressValidationMessage = (value: unknown) => {
  const normalized = normalizeEmailAddress(value)
  if (!normalized) return ''
  if (normalized.length > MAX_EMAIL_ADDRESS_LENGTH) {
    return `El correo no puede exceder ${MAX_EMAIL_ADDRESS_LENGTH} caracteres.`
  }
  if (normalized.includes('@casita')) {
    return 'Ingresa un correo real; no se aceptan correos provisionales de Casita.'
  }
  if (!EMAIL_ADDRESS_PATTERN.test(normalized)) {
    return 'Ingresa un correo electrónico válido.'
  }
  return ''
}
