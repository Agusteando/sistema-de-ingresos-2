export const PAYMENT_REGISTERING_USER_KEY_SQL = `CASE
  WHEN NULLIF(TRIM(r.usuario_email), '') IS NOT NULL
    THEN CONCAT('email:', LOWER(TRIM(r.usuario_email)))
  WHEN NULLIF(TRIM(r.usuario), '') IS NOT NULL
    THEN CONCAT('name:', LOWER(TRIM(r.usuario)))
  ELSE 'unknown:'
END`

export const normalizePaymentUserKeys = (value: unknown): string[] => {
  let source: unknown[] = Array.isArray(value)
    ? value
    : (value === null || value === undefined ? [] : [value])

  if (source.length === 1 && typeof source[0] === 'string' && source[0].trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(source[0])
      if (Array.isArray(parsed)) source = parsed
    } catch {
      source = []
    }
  }

  const keys = source
    .map(item => String(item || '').trim())
    .filter(key => /^(email:|name:|unknown:)/.test(key) && key.length <= 320)

  return Array.from(new Set(keys))
}

export const formatPaymentUserLabel = (nameValue: unknown, emailValue: unknown) => {
  const nombre = String(nameValue || '').trim()
  const email = String(emailValue || '').trim().toLowerCase()

  if (nombre && email && nombre.toLowerCase() !== email) return `${nombre} (${email})`
  return email || nombre || 'No identificado'
}
