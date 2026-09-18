export const PAYMENT_TIME_ZONE = 'America/Mexico_City'

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PAYMENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const partsFor = (date: Date) => {
  const parts = dateTimeFormatter.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

const validDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const validTime = (value: string) => /^\d{2}:\d{2}:\d{2}$/.test(value)

export const formatMexicoCityDateTimeFromUnix = (unixSeconds: number) => {
  const seconds = Number(unixSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const parts = partsFor(new Date(seconds * 1000))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export const formatMexicoCityDateKeyFromUnix = (unixSeconds: number) => (
  formatMexicoCityDateTimeFromUnix(unixSeconds).slice(0, 10)
)

const timeZoneOffsetMs = (instantMs: number) => {
  const parts = partsFor(new Date(instantMs))
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return representedAsUtc - Math.floor(instantMs / 1000) * 1000
}

export const mexicoCityDateTimeToUnix = (dateKey: string, time = '00:00:00') => {
  if (!validDateKey(dateKey) || !validTime(time)) {
    throw new Error('Invalid Mexico City date/time.')
  }

  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute, second] = time.split(':').map(Number)
  const desiredWallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)

  let instantMs = desiredWallClockAsUtc
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nextInstantMs = desiredWallClockAsUtc - timeZoneOffsetMs(instantMs)
    if (nextInstantMs === instantMs) break
    instantMs = nextInstantMs
  }

  const roundTrip = formatMexicoCityDateTimeFromUnix(Math.floor(instantMs / 1000))
  if (roundTrip !== `${dateKey} ${time}`) {
    throw new Error(`Unable to resolve Mexico City wall clock: ${dateKey} ${time}`)
  }

  return Math.floor(instantMs / 1000)
}

export const addDaysToDateKey = (dateKey: string, days: number) => {
  if (!validDateKey(dateKey) || !Number.isInteger(days)) {
    throw new Error('Invalid date range.')
  }
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return [
    String(value.getUTCFullYear()).padStart(4, '0'),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export const mexicoCityDateRangeToUnix = (inicio: string, fin: string) => {
  if (!validDateKey(inicio) || !validDateKey(fin) || inicio > fin) {
    throw new Error('Invalid Mexico City date range.')
  }

  return {
    startUnix: mexicoCityDateTimeToUnix(inicio, '00:00:00'),
    endExclusiveUnix: mexicoCityDateTimeToUnix(addDaysToDateKey(fin, 1), '00:00:00'),
  }
}
