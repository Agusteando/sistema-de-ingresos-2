import { computed } from 'vue'
import { useCookie, useState } from '#app'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

type AccountStateSyncStatus = 'idle' | 'cached' | 'syncing' | 'updated' | 'failed'

type AccountStateCacheOptions = {
  matricula?: string | number | null
  ciclo?: string | number | null
  lateFeeActive?: string | boolean | number | null
}

type AccountStateCacheRecord = {
  version: number
  key: string
  matricula: string
  ciclo: string
  lateFeeActive: boolean
  savedAt: string
  debts: unknown[]
}

type AccountStateSyncState = {
  status: AccountStateSyncStatus
  message: string
  lastUpdatedAt: string | null
  recordCount: number
  hasCache: boolean
  error: string | null
}

const CACHE_VERSION = 2
const CACHE_NAMESPACE = 'account-state-cache'

const encodeKeySegment = (value: string) => encodeURIComponent(value || 'default')

const normalizeMatricula = (value?: string | number | null) => String(value || '').trim().toUpperCase()

const normalizeLateFeeFlag = (value?: string | boolean | number | null) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const normalized = String(value ?? 'true').trim().toLowerCase()
  return !['false', '0', 'no', 'off'].includes(normalized)
}

const safeParseRecord = (raw: string | null): AccountStateCacheRecord | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed?.debts)) return null
    return parsed as AccountStateCacheRecord
  } catch (error) {
    console.warn('[Estado de Cuenta cache] Could not parse cached account state.', error)
    return null
  }
}

export const useAccountStateCacheSync = () => {
  const userRole = useCookie('auth_role')
  const activePlantel = useCookie('auth_active_plantel')

  const accountStateSyncState = useState<AccountStateSyncState>('account-state-cache-sync-state', () => ({
    status: 'idle',
    message: '',
    lastUpdatedAt: null,
    recordCount: 0,
    hasCache: false,
    error: null
  }))

  const cacheScope = computed(() => ({
    role: String(userRole.value || 'plantel'),
    plantel: String(activePlantel.value || 'default')
  }))

  const getAccountStateCacheKey = (options: AccountStateCacheOptions = {}) => {
    const matricula = normalizeMatricula(options.matricula)
    const ciclo = normalizeCicloKey(options.ciclo || '')
    const lateFeeActive = normalizeLateFeeFlag(options.lateFeeActive) ? 'recargos-on' : 'recargos-off'

    return [
      CACHE_NAMESPACE,
      `v${CACHE_VERSION}`,
      encodeKeySegment(cacheScope.value.role),
      encodeKeySegment(cacheScope.value.plantel),
      encodeKeySegment(matricula || 'sin-matricula'),
      encodeKeySegment(ciclo || 'default'),
      lateFeeActive
    ].join(':')
  }

  const setAccountStateSyncState = (patch: Partial<AccountStateSyncState>) => {
    accountStateSyncState.value = {
      ...accountStateSyncState.value,
      ...patch
    }
  }

  const readCachedAccountState = (options: AccountStateCacheOptions = {}) => {
    if (!process.client) return null

    const key = getAccountStateCacheKey(options)
    const record = safeParseRecord(localStorage.getItem(key))
    if (!record) return null

    return {
      key,
      debts: record.debts,
      savedAt: record.savedAt,
      count: record.debts.length
    }
  }

  const writeCachedAccountState = (options: AccountStateCacheOptions = {}, debts: unknown[] = []) => {
    if (!process.client || !Array.isArray(debts)) return false

    const key = getAccountStateCacheKey(options)
    const record: AccountStateCacheRecord = {
      version: CACHE_VERSION,
      key,
      matricula: normalizeMatricula(options.matricula),
      ciclo: normalizeCicloKey(options.ciclo || ''),
      lateFeeActive: normalizeLateFeeFlag(options.lateFeeActive),
      savedAt: new Date().toISOString(),
      debts
    }

    try {
      localStorage.setItem(key, JSON.stringify(record))
      return true
    } catch (error) {
      console.warn('[Estado de Cuenta cache] Could not persist account state cache.', error)
      return false
    }
  }

  return {
    accountStateSyncState,
    getAccountStateCacheKey,
    readCachedAccountState,
    writeCachedAccountState,
    setAccountStateSyncState
  }
}
