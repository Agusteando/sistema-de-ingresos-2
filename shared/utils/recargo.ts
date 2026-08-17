export type LateFeeDecision = {
  enabled: boolean
  force?: boolean
  hasManualLateFee: boolean
  hasPayment: boolean
  hasActiveConvention: boolean
  isAfterDeadline: boolean
  balanceBeforeLateFee: number
}

export const shouldApplyLateFee = ({
  enabled,
  force = false,
  hasManualLateFee,
  hasPayment,
  hasActiveConvention,
  isAfterDeadline,
  balanceBeforeLateFee,
}: LateFeeDecision) => Boolean(
  force
  || hasManualLateFee
  || (
    enabled
    && !hasPayment
    && !hasActiveConvention
    && isAfterDeadline
    && Number(balanceBeforeLateFee || 0) > 10
  )
)

export const normalizeLateFeePercentage = (value: unknown, fallback = 10) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return fallback
  return parsed
}

export const calculateLateFeeSubtotal = (baseAmount: unknown, percentage: unknown = 10) => {
  const base = Math.max(0, Number(baseAmount || 0))
  const rate = normalizeLateFeePercentage(percentage)
  return Math.trunc(base * (1 + (rate / 100)))
}

export const padDatePart = (value: number) => String(value).padStart(2, '0')

export const normalizeDateKey = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)

  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) return ''

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

export const getCycleStartYear = (ciclo: string, fallbackYear: number) => {
  const parsed = Number.parseInt(String(ciclo || '').match(/\d{4}/)?.[0] || '', 10)
  return Number.isFinite(parsed) ? parsed : fallbackYear
}

export const getSchoolMonthForCycle = ({
  year,
  month,
  cycleStartYear,
}: {
  year: number
  month: number
  cycleStartYear: number
}) => {
  if (year < cycleStartYear || (year === cycleStartYear && month < 9)) return 0
  if (year === cycleStartYear && month >= 9) return month - 8
  if (year === cycleStartYear + 1 && month <= 8) return month + 4
  return 12
}

export const getSchoolMonthForDateKey = (ciclo: string, currentDateValue: unknown) => {
  const currentDateKey = normalizeDateKey(currentDateValue)
  const match = currentDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 0

  const year = Number(match[1])
  const month = Number(match[2])
  const cycleStartYear = getCycleStartYear(ciclo, year)
  return getSchoolMonthForCycle({ year, month, cycleStartYear })
}

export const normalizeCutoffDay = (value: unknown) => {
  const parsed = Math.trunc(Number(value || 12))
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 28 ? parsed : 12
}

export const getSchoolPeriodDeadline = (cycleStartYear: number, schoolMonth: number, cutoffDay: unknown = 12) => {
  const normalized = Math.min(12, Math.max(1, schoolMonth))
  const calendarYear = normalized <= 4 ? cycleStartYear : cycleStartYear + 1
  const calendarMonth = normalized <= 4 ? normalized + 8 : normalized - 4
  return `${calendarYear}-${padDatePart(calendarMonth)}-${padDatePart(normalizeCutoffDay(cutoffDay))}`
}

export const getSchoolPeriodDeadlineForCycle = (
  ciclo: string,
  schoolMonth: number,
  currentDateValue: unknown,
  cutoffDay: unknown = 12,
) => {
  const currentDateKey = normalizeDateKey(currentDateValue)
  const fallbackYear = Number(currentDateKey.slice(0, 4)) || new Date().getFullYear()
  return getSchoolPeriodDeadline(getCycleStartYear(ciclo, fallbackYear), schoolMonth, cutoffDay)
}

export const isPastPaymentDeadline = (deadline: string, currentDateValue: unknown) => {
  const currentDateKey = normalizeDateKey(currentDateValue)
  return Boolean(deadline && currentDateKey && deadline < currentDateKey)
}

export type LateFeeTiming = {
  deadline: string
  isAfterDeadline: boolean
  mode: 'school-period' | 'service'
}

export const resolveLateFeeTiming = ({
  ciclo,
  schoolMonth,
  currentDateValue,
  cutoffDay = 12,
  isService = false,
  isEventual = false,
}: {
  ciclo: string
  schoolMonth: number
  currentDateValue: unknown
  cutoffDay?: unknown
  isService?: boolean
  isEventual?: boolean
}): LateFeeTiming => {
  const currentDateKey = normalizeDateKey(currentDateValue)

  // Servicios de cobro único no tienen un mes académico confiable. Una vez
  // clasificados explícitamente como servicio, su vencimiento se evalúa contra
  // el día de corte del mismo mes calendario de la fecha de pago.
  if (isService && isEventual) {
    const deadline = currentDateKey
      ? `${currentDateKey.slice(0, 7)}-${padDatePart(normalizeCutoffDay(cutoffDay))}`
      : ''
    return {
      deadline,
      isAfterDeadline: isPastPaymentDeadline(deadline, currentDateKey),
      mode: 'service',
    }
  }

  const deadline = getSchoolPeriodDeadlineForCycle(
    ciclo,
    schoolMonth,
    currentDateValue,
    cutoffDay,
  )

  return {
    deadline,
    isAfterDeadline: isPastPaymentDeadline(deadline, currentDateKey),
    mode: 'school-period',
  }
}
