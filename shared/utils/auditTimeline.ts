// Audit dates are stored in Mexico City local time. Preserve source precision for
// ordering; Date/Number conversion would discard microseconds and nanoseconds.
const timestampKey = (value: unknown) => {
  const text = String(value || '').replace('T', ' ')
  const match = text.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?$/)
  return match ? match[1] + '.' + (match[2] || '').padEnd(9, '0') : text
}
export const compareAuditNewest = (a: {recordedAt: string; eventId?: number}, b: {recordedAt: string; eventId?: number}) =>
  timestampKey(b.recordedAt).localeCompare(timestampKey(a.recordedAt)) || Number(b.eventId || 0) - Number(a.eventId || 0)
export const auditDateLabel = (value: string) => {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?$/)
  if (!match) return ''
  const date = new Date(match[1] + 'T' + match[2] + '-06:00')
  if (!Number.isFinite(date.getTime())) return ''
  const day = new Intl.DateTimeFormat('es-MX', {day:'numeric',month:'short',year:'numeric',timeZone:'America/Mexico_City'}).format(date)
  // Do not imply sub-second precision when the old source never retained it.
  const fraction = match[3] && /[1-9]/.test(match[3]) ? '.' + match[3].padEnd(3, '0') : ''
  return day + ' · ' + match[2] + fraction
}
