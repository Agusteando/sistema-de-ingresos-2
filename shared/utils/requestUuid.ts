/**
 * Create an RFC 4122 UUID v4 even when the application runs on a LAN HTTP origin.
 * crypto.randomUUID() is restricted to secure contexts; getRandomValues() is not.
 * Both paths remain cryptographically random and compatible with request deduplication.
 */
export const createRequestUuid = (
  cryptoSource: (Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>) | null = globalThis.crypto,
): string => {
  if (typeof cryptoSource?.randomUUID === 'function') return cryptoSource.randomUUID()
  if (typeof cryptoSource?.getRandomValues !== 'function') {
    throw new Error('El navegador no permite generar un identificador seguro para este documento.')
  }

  const bytes = cryptoSource.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
