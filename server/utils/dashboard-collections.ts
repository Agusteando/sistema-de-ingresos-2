import { DASHBOARD_PLANTELES } from '../../utils/constants'
import { getDbTransport, query, runWithBridgeAgentId } from './db'

const PAYMENT_PLANTEL_SQL = `UPPER(COALESCE(
  NULLIF(TRIM(r.plantel_pago), ''),
  NULLIF(TRIM(r.plantel), ''),
  NULLIF(TRIM(A.plantel), '')
))`

const PAYMENT_REGISTERED_AT_SQL = 'COALESCE(r.fecha_original, r.fecha)'

const CANCELED_STATUS_SQL = `LOWER(TRIM(COALESCE(CAST(r.estatus AS CHAR), ''))) IN (
  'cancelada', 'cancelado', 'cancelled', 'canceled'
)`

const DEPURATION_ADJUSTMENT_SQL = `(
  COALESCE(r.depurado, 0) = 1
  AND LOWER(TRIM(COALESCE(r.formaDePago, ''))) IN ('depuracion', 'depuración')
  AND COALESCE(r.pago_otro_plantel, 0) = 0
)`

const APPLIED_AMOUNT_SQL = `CASE
  WHEN ${CANCELED_STATUS_SQL} THEN 0
  WHEN ${DEPURATION_ADJUSTMENT_SQL} THEN 0
  ELSE COALESCE(r.monto, 0)
END`

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

const mexicoCityDateParts = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    month: `${values.year}-${values.month}`
  }
}

const monthBounds = (month: string) => {
  const [yearValue, monthValue] = month.split('-').map(Number)
  const next = new Date(Date.UTC(yearValue, monthValue, 1))
  const nextYear = next.getUTCFullYear()
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, '0')
  return {
    start: `${month}-01`,
    end: `${nextYear}-${nextMonth}-01`,
    days: new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate()
  }
}

const runLimited = async <T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  })

  await Promise.all(workers)
  return results
}

export type DashboardAggregateRow = {
  currentDate: string
  dayKey: string | null
  hourOfDay: number | string | null
  total: number | string | null
  movements: number | string | null
}

export type DashboardPlantelCollection = {
  plantel: typeof DASHBOARD_PLANTELES[number]
  status: 'online' | 'offline'
  dayTotal: number
  monthTotal: number
  dayMovements: number
  monthMovements: number
  daySeries: number[]
  monthSeries: number[]
}

export const aggregateDashboardRows = (
  rows: DashboardAggregateRow[],
  month: string,
  daysInMonth: number,
  fallbackCurrentDate: string
) => {
  const currentDate = String(rows[0]?.currentDate || fallbackCurrentDate)
  const daySeries = Array.from({ length: 24 }, () => 0)
  const monthSeries = Array.from({ length: daysInMonth }, () => 0)
  let dayMovements = 0
  let monthMovements = 0

  for (const row of rows) {
    const dayKey = String(row.dayKey || '')
    if (!dayKey) continue

    const amount = Number(row.total || 0)
    const movements = Number(row.movements || 0)

    if (dayKey === currentDate) {
      const hour = Number(row.hourOfDay)
      if (Number.isInteger(hour) && hour >= 0 && hour < daySeries.length) {
        daySeries[hour] += amount
      }
      dayMovements += movements
    }

    if (dayKey.startsWith(`${month}-`)) {
      const dayIndex = Number(dayKey.slice(8, 10)) - 1
      if (Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < monthSeries.length) {
        monthSeries[dayIndex] += amount
      }
      monthMovements += movements
    }
  }

  return {
    currentDate,
    daySeries,
    monthSeries,
    dayMovements,
    monthMovements,
    dayTotal: daySeries.reduce((sum, value) => sum + value, 0),
    monthTotal: monthSeries.reduce((sum, value) => sum + value, 0)
  }
}

const loadPlantelCollection = async (
  plantel: typeof DASHBOARD_PLANTELES[number],
  month: string,
  monthStart: string,
  monthEnd: string,
  daysInMonth: number
): Promise<DashboardPlantelCollection & { currentDate: string }> => {
  try {
    const rows = await runWithBridgeAgentId(plantel, () => query<DashboardAggregateRow[]>(`
      SELECT
        clock.currentDate,
        source_rows.dayKey,
        source_rows.hourOfDay,
        COALESCE(SUM(source_rows.appliedAmount), 0) AS total,
        COALESCE(SUM(source_rows.movements), 0) AS movements
      FROM (
        SELECT
          DATE_FORMAT(${PAYMENT_REGISTERED_AT_SQL}, '%Y-%m-%d') AS dayKey,
          HOUR(${PAYMENT_REGISTERED_AT_SQL}) AS hourOfDay,
          ${APPLIED_AMOUNT_SQL} AS appliedAmount,
          1 AS movements
        FROM referenciasdepago r
        LEFT JOIN base A ON A.matricula = r.matricula
        WHERE ${PAYMENT_PLANTEL_SQL} = ?
          AND (
            (${PAYMENT_REGISTERED_AT_SQL} >= ? AND ${PAYMENT_REGISTERED_AT_SQL} < ?)
            OR (${PAYMENT_REGISTERED_AT_SQL} >= CURRENT_DATE() AND ${PAYMENT_REGISTERED_AT_SQL} < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY))
          )

        UNION ALL

        SELECT NULL AS dayKey, NULL AS hourOfDay, 0 AS appliedAmount, 0 AS movements
      ) source_rows
      CROSS JOIN (
        SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS currentDate
      ) clock
      GROUP BY clock.currentDate, source_rows.dayKey, source_rows.hourOfDay
      ORDER BY source_rows.dayKey ASC, source_rows.hourOfDay ASC
    `, [plantel, monthStart, monthEnd]))

    const aggregate = aggregateDashboardRows(rows, month, daysInMonth, mexicoCityDateParts().date)

    return {
      plantel,
      status: 'online',
      ...aggregate
    }
  } catch (error) {
    console.error(`[Dashboard] No se pudo consultar ${plantel}:`, error)
    return {
      plantel,
      status: 'offline',
      currentDate: mexicoCityDateParts().date,
      dayTotal: 0,
      monthTotal: 0,
      dayMovements: 0,
      monthMovements: 0,
      daySeries: Array.from({ length: 24 }, () => 0),
      monthSeries: Array.from({ length: daysInMonth }, () => 0)
    }
  }
}

export const loadPlantelCollectionsDashboard = async (monthValue: unknown) => {
  const mexicoClock = mexicoCityDateParts()
  const month = MONTH_PATTERN.test(String(monthValue || '')) ? String(monthValue) : mexicoClock.month
  const bounds = monthBounds(month)
  const concurrency = getDbTransport() === 'bridge' ? 4 : DASHBOARD_PLANTELES.length
  const results = await runLimited(
    DASHBOARD_PLANTELES,
    concurrency,
    plantel => loadPlantelCollection(plantel, month, bounds.start, bounds.end, bounds.days)
  )
  const currentDate = results.find(result => result.status === 'online')?.currentDate || mexicoClock.date
  const planteles = results.map(({ currentDate: _currentDate, ...result }) => result)

  return {
    currentDate,
    month,
    planteles,
    totals: {
      day: planteles.reduce((sum, plantel) => sum + plantel.dayTotal, 0),
      month: planteles.reduce((sum, plantel) => sum + plantel.monthTotal, 0),
      dayMovements: planteles.reduce((sum, plantel) => sum + plantel.dayMovements, 0),
      monthMovements: planteles.reduce((sum, plantel) => sum + plantel.monthMovements, 0)
    },
    generatedAt: new Date().toISOString()
  }
}
