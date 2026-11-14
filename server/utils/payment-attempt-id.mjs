import { createHash, randomBytes } from 'node:crypto'

// The reference is opaque to the cashier and never reused for a new operation.
export const validPaymentAttemptId = (raw) => {
  const value = String(raw || '').trim().toUpperCase()
  return /^PAY-[A-Z0-9]{4,24}-[A-Z0-9]{4,16}$/.test(value) ? value : ''
}

export const newPaymentAttemptId = () =>
  `PAY-${Date.now().toString(36).toUpperCase()}-${randomBytes(8).toString('hex').toUpperCase()}`

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  return value === undefined ? null : value
}

export const paymentPayloadDigest = (payload) =>
  createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')

export const paymentRowReference = (id, digest, index) => {
  if (!validPaymentAttemptId(id) || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(index) || index < 0) {
    throw new Error('Invalid payment attempt reference')
  }
  return `${id}:${digest}:${index}`
}

export const parsePaymentRowReference = (value, id) => {
  if (!validPaymentAttemptId(id)) return null
  const raw = String(value || '')
  if (!raw.startsWith(`${id}:`)) return null
  const match = raw.slice(id.length + 1).match(/^([a-f0-9]{64}):(0|[1-9][0-9]*)$/)
  if (!match) return null
  const index = Number(match[2])
  return Number.isSafeInteger(index) ? { digest: match[1], index } : null
}
