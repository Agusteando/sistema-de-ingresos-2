import { computed } from 'vue'
import { useCookie, useState } from '#app'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { normalizeEnrollmentConceptIds } from '~/shared/utils/studentPresentation'

type StudentsCacheSyncStatus = 'idle' | 'cached' | 'syncing' | 'updated' | 'failed' | 'unavailable'

type StudentsCacheOptions = {
  ciclo?: string | number | null
  q?: string | null
  enrollmentConcepts?: unknown
}

type StudentsCacheRecord = {
  version: number
  key: string
  ciclo: string
  query: string
  savedAt: string
  students: unknown[]
  enrollmentConceptSignature?: string
  enrollmentConcepts?: string[]
}

type StudentsSyncState = {
  status: StudentsCacheSyncStatus
  message: string
  lastUpdatedAt: string | null
  recordCount: number
  hasCache: boolean
  error: string | null
}

const CACHE_VERSION = 4
const LEGACY_CACHE_VERSIONS = [2]
const CACHE_NAMESPACE = 'students-cache'

const normalizeQuery = (value?: string | null) => String(value || '').trim()

const encodeKeySegment = (value: string) => encodeURIComponent(value || 'default')

const enrollmentConceptSignature = (values: unknown) => normalizeEnrollmentConceptIds(values)
  .map(String)
  .sort((a, b) => Number(a) - Number(b))
  .join('|')

const safeParseRecord = (raw: string | null): StudentsCacheRecord | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.students)) return null
    const version = Number(parsed?.version)
    if (![CACHE_VERSION, ...LEGACY_CACHE_VERSIONS].includes(version)) return null
    return parsed as StudentsCacheRecord
  } catch (error) {
    console.warn('[Students cache] Could not parse cached students.', error)
    return null
  }
}

const isCacheRecordConceptCompatible = (record: StudentsCacheRecord, options: StudentsCacheOptions = {}) => {
  const requestedSignature = enrollmentConceptSignature(options.enrollmentConcepts)
  if (!requestedSignature) return true

  const recordSignature = typeof record.enrollmentConceptSignature === 'string'
    ? record.enrollmentConceptSignature
    : null

  if (recordSignature === null) return true
  return recordSignature === requestedSignature
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

  const getStudentsCacheKeyForVersion = (version: number, options: StudentsCacheOptions = {}) => {
    const ciclo = normalizeCicloKey(options.ciclo || '')
    const query = normalizeQuery(options.q).toLowerCase()

    return [
      CACHE_NAMESPACE,
      `v${version}`,
      encodeKeySegment(cacheScope.value.role),
      encodeKeySegment(cacheScope.value.plantel),
      encodeKeySegment(ciclo || 'default'),
      encodeKeySegment(query || 'all')
    ].join(':')
  }

  const getStudentsCacheKey = (options: StudentsCacheOptions = {}) => getStudentsCacheKeyForVersion(CACHE_VERSION, options)

  const getStudentsCacheReadKeys = (options: StudentsCacheOptions = {}) => [
    getStudentsCacheKeyForVersion(CACHE_VERSION, options),
    ...LEGACY_CACHE_VERSIONS.map(version => getStudentsCacheKeyForVersion(version, options))
  ]

  const setStudentsSyncState = (patch: Partial<StudentsSyncState>) => {
    studentsSyncState.value = {
      ...studentsSyncState.value,
      ...patch
    }
  }

  const readCachedStudents = (options: StudentsCacheOptions = {}) => {
    if (!process.client) return null

    for (const key of getStudentsCacheReadKeys(options)) {
      const record = safeParseRecord(localStorage.getItem(key))
      if (!record || !isCacheRecordConceptCompatible(record, options)) continue

      return {
        key,
        students: record.students,
        savedAt: record.savedAt,
        count: record.students.length,
        isLegacy: Number(record.version) !== CACHE_VERSION,
        enrollmentConceptSignature: record.enrollmentConceptSignature || '',
        enrollmentConcepts: Array.isArray(record.enrollmentConcepts)
          ? normalizeEnrollmentConceptIds(record.enrollmentConcepts)
          : normalizeEnrollmentConceptIds(record.enrollmentConceptSignature || '')
      }
    }

    return null
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
      students,
      enrollmentConceptSignature: enrollmentConceptSignature(options.enrollmentConcepts),
      enrollmentConcepts: normalizeEnrollmentConceptIds(options.enrollmentConcepts)
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
