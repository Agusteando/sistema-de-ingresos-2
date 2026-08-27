import { automaticSchoolCycleKey, formatCicloLabel, normalizeCicloKey } from '../../shared/utils/ciclo'
import { controlEscolarCentralQuery } from './control-escolar-central'

type SchoolCycleRow = {
  cycle_name?: string | number | null
  is_current?: number | string | boolean | null
}

export type InstitutionalSchoolCycle = {
  key: string
  label: string
  source: 'configured' | 'calendar'
  schoolYears: Array<{ value: string; label: string; isCurrent: boolean }>
}

const CACHE_TTL_MS = 60_000
let cached: { expiresAt: number; value: InstitutionalSchoolCycle } | null = null

const cycleKey = (value: unknown) => String(value ?? '').trim().match(/\d{4}/)?.[0] || ''

const calendarCycleKeys = (current: string) => {
  const start = Number(current)
  if (!Number.isFinite(start)) return []
  return [start, start + 1, start - 1, start - 2, start - 3].map(String)
}

export const readInstitutionalSchoolCycle = async (force = false): Promise<InstitutionalSchoolCycle> => {
  const now = Date.now()
  if (!force && cached && cached.expiresAt > now) return cached.value

  const automatic = automaticSchoolCycleKey()
  let rows: SchoolCycleRow[] = []
  try {
    rows = await controlEscolarCentralQuery<SchoolCycleRow[]>(`
      SELECT CAST(cycle_name AS CHAR) AS cycle_name, is_current
      FROM config_school_cycles
      ORDER BY cycle_name DESC
    `)
  } catch {
    rows = []
  }

  const configuredKeys = rows.map((row) => cycleKey(row.cycle_name)).filter(Boolean)
  const configuredCurrent = rows
    .filter((row) => Number(row.is_current || 0) === 1)
    .map((row) => cycleKey(row.cycle_name))
    .filter(Boolean)
    .sort((left, right) => Number(right) - Number(left))[0] || ''

  const key = normalizeCicloKey(configuredCurrent || automatic, automatic)
  const others = Array.from(new Set([...configuredKeys, ...calendarCycleKeys(key), automatic]))
    .filter((value) => Boolean(value) && value !== key)
    .sort((left, right) => Number(right) - Number(left))
  const values = [key, ...others]

  const value: InstitutionalSchoolCycle = {
    key,
    label: formatCicloLabel(key),
    source: configuredCurrent ? 'configured' : 'calendar',
    schoolYears: values.map((value) => ({
      value,
      label: formatCicloLabel(value),
      isCurrent: value === key
    }))
  }

  cached = { expiresAt: now + CACHE_TTL_MS, value }
  return value
}

export const invalidateInstitutionalSchoolCycleCache = () => {
  cached = null
}
