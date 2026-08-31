const normalizeFlag = (value: unknown) => String(value ?? '').trim().toLowerCase()

const FRESH_VALUES = new Set(['1', 'true', 'yes', 'fresh', 'live', 'bypass', 'no-cache', 'no_store'])

/**
 * Opt-in contract for consumers that are not allowed to receive cached student data.
 * `fresh=1` is the canonical public parameter. `cache=bypass|no-cache` is accepted
 * as an explicit alias for server-to-server callers.
 */
export const isExternalFreshReadRequested = (query: any = {}) => {
  const fresh = normalizeFlag(query?.fresh)
  if (FRESH_VALUES.has(fresh)) return true

  const cache = normalizeFlag(query?.cache)
  return cache === 'bypass' || cache === 'no-cache' || cache === 'no_store' || cache === '0' || cache === 'false'
}
