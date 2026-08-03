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
  cycleStartYear
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

export const getSchoolPeriodDeadline = (cycleStartYear: number, schoolMonth: number) => {
  const normalized = Math.min(12, Math.max(1, schoolMonth))
  const calendarYear = normalized <= 4 ? cycleStartYear : cycleStartYear + 1
  const calendarMonth = normalized <= 4 ? normalized + 8 : normalized - 4
  return `${calendarYear}-${padDatePart(calendarMonth)}-12`
}

export const getSchoolPeriodDeadlineForCycle = (
  ciclo: string,
  schoolMonth: number,
  currentDateValue: unknown
) => {
  const currentDateKey = normalizeDateKey(currentDateValue)
  const fallbackYear = Number(currentDateKey.slice(0, 4)) || new Date().getFullYear()
  return getSchoolPeriodDeadline(getCycleStartYear(ciclo, fallbackYear), schoolMonth)
}

export const isPastPaymentDeadline = (deadline: string, currentDateValue: unknown) => {
  const currentDateKey = normalizeDateKey(currentDateValue)
  return Boolean(deadline && currentDateKey && deadline < currentDateKey)
}

type LateFeeDecision = {
  enabled: boolean
  isEventual: boolean
  hasManualLateFee: boolean
  hasPayment: boolean
  hasActiveConvention: boolean
  isAfterDeadline: boolean
  balanceBeforeLateFee: number
}

export const shouldApplyLateFee = ({
  enabled,
  isEventual,
  hasManualLateFee,
  hasPayment,
  hasActiveConvention,
  isAfterDeadline,
  balanceBeforeLateFee
}: LateFeeDecision) => Boolean(
  enabled
  && !isEventual
  && (
    hasManualLateFee
    || (
      !hasPayment
      && !hasActiveConvention
      && isAfterDeadline
      && balanceBeforeLateFee > 10
    )
  )
)
