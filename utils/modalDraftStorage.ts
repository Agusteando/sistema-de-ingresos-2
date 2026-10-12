// Optional browser backup: these errors must not be part of the payment transaction.
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type DraftStorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unavailable' | 'quota' | 'security' | 'unknown' }

export function safeDraftStorage<T>(
  callback: (storage: DraftStorage) => T,
  storageProvider: () => DraftStorage | null = () => typeof window === 'undefined' ? null : window.localStorage
): DraftStorageResult<T> {
  try {
    const storage = storageProvider()
    if (!storage) return { ok: false, reason: 'unavailable' }
    return { ok: true, value: callback(storage) }
  } catch (error) {
    const name = String((error as { name?: string })?.name || '')
    const code = Number((error as { code?: number })?.code || 0)
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) {
      return { ok: false, reason: 'quota' }
    }
    if (name === 'SecurityError') return { ok: false, reason: 'security' }
    return { ok: false, reason: 'unknown' }
  }
}
