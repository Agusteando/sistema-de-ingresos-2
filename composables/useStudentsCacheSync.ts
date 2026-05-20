import { computed } from 'vue'
import { useCookie, useState } from '#app'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

type StudentsCacheSyncStatus = 'idle' | 'cached' | 'syncing' | 'updated' | 'failed'

type StudentsCacheOptions = {
  ciclo?: string | number | null
  q?: string | null
}

type StudentsCacheRecord = {
  version: number
  key: string
  ciclo: string
  query: string
  savedAt: string
  students: unknown[]
}

type StudentsSyncState = {
  status: StudentsCacheSyncStatus
  message: string
  lastUpdatedAt: string | null
  recordCount: number
  hasCache: boolean
  error: string | null
}

const CACHE_VERSION = 3
const CACHE_NAMESPACE = 'students-cache'

const normalizeQuery = (value?: string | null) => String(value || '').trim()

const encodeKeySegment = (value: string) => encodeURIComponent(value || 'default')

const safeParseRecord = (raw: string | null): StudentsCacheRecord | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed?.students)) return null
    return parsed as StudentsCacheRecord
  } catch (error) {
    console.warn('[Students cache] Could not parse cached students.', error)
    return null
  }
}

export const useStudentsCacheSync = () => {
  const userRole = useCookie('auth_role')
  const activePlantel = useCookie('auth_active_plantel')

  const studentsSyncState = useState<StudentsSyncState>('students-cache-sync-state', () => ({
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

  const getStudentsCacheKey = (options: StudentsCacheOptions = {}) => {
    const ciclo = normalizeCicloKey(options.ciclo || '')
    const query = normalizeQuery(options.q).toLowerCase()

    return [
      CACHE_NAMESPACE,
      `v${CACHE_VERSION}`,
      encodeKeySegment(cacheScope.value.role),
      encodeKeySegment(cacheScope.value.plantel),
      encodeKeySegment(ciclo || 'default'),
      encodeKeySegment(query || 'all')
    ].join(':')
  }

  const setStudentsSyncState = (patch: Partial<StudentsSyncState>) => {
    studentsSyncState.value = {
      ...studentsSyncState.value,
      ...patch
    }
  }

  const readCachedStudents = (options: StudentsCacheOptions = {}) => {
    if (!process.client) return null

    const key = getStudentsCacheKey(options)
    const record = safeParseRecord(localStorage.getItem(key))
    if (!record) return null

    return {
      key,
      students: record.students,
      savedAt: record.savedAt,
      count: record.students.length
    }
  }

  const writeCachedStudents = (options: StudentsCacheOptions = {}, students: unknown[] = []) => {
    if (!process.client || !Array.isArray(students)) return false

    const key = getStudentsCacheKey(options)
    const record: StudentsCacheRecord = {
      version: CACHE_VERSION,
      key,
      ciclo: normalizeCicloKey(options.ciclo || ''),
      query: normalizeQuery(options.q),
      savedAt: new Date().toISOString(),
      students
    }

    try {
      localStorage.setItem(key, JSON.stringify(record))
      return true
    } catch (error) {
      console.warn('[Students cache] Could not persist students cache.', error)
      return false
    }
  }

  return {
    studentsSyncState,
    getStudentsCacheKey,
    readCachedStudents,
    writeCachedStudents,
    setStudentsSyncState
  }
}
