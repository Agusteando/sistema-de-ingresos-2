// Retrospective aggregation only: no request tracking or database writes.
export const ACTIVITY_SNAPSHOT_MESSAGE = 'observatory.activity.snapshot'
const HOUR = 3600
const INTERVAL_MS = 10 * 60 * 1000

export function calendarWindow(now = Date.now()) {
  const end = Math.floor(now / 1000 / HOUR) * HOUR
  const start = Math.floor((end - 21600) / 86400) * 86400 + 21600 - 13 * 86400
  return { start, end }
}

export function activitySnapshot({ app, source, kinds, rows, now = Date.now() }) {
  const { start, end } = calendarWindow(now)
  const allowed = new Set(kinds)
  const counts = []
  const seen = new Set()
  for (const row of rows) {
    const kind = String(row.kind || '')
    const bucket = Number(row.bucket_end)
    const count = Number(row.count)
    const key = kind + ':' + bucket
    if (row.count === null || row.count === '' || typeof row.count === 'boolean' ||
        !allowed.has(kind) || !Number.isSafeInteger(bucket) || bucket % HOUR ||
        bucket <= start || bucket > end || !Number.isSafeInteger(count) || count < 0 ||
        seen.has(key)) throw new Error('INVALID_ACTIVITY_AGGREGATE')
    seen.add(key)
    if (count) counts.push([kind, bucket, count])
  }
  if (counts.length > 336 * allowed.size) throw new Error('ACTIVITY_AGGREGATE_TOO_LARGE')
  counts.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  const result = {
    message: ACTIVITY_SNAPSHOT_MESSAGE, version: 1, app, source,
    generated_at: Math.floor(now / 1000), window_start: start, window_end: end,
    counts
  }
  return result
}

export function activityFrames(snapshot, kinds) {
  const { counts, ...metadata } = snapshot
  const frames = new Map(kinds.map(metric => [metric, {
    ...metadata, metric,
    values: Array((snapshot.window_end - snapshot.window_start) / HOUR).fill(null)
  }]))
  for (const [kind, end, count] of counts) {
    frames.get(kind).values[(end - snapshot.window_start) / HOUR - 1] = count
  }
  for (const frame of frames.values()) {
    if (Buffer.byteLength(JSON.stringify(frame)) > 12000) throw new Error('ACTIVITY_AGGREGATE_TOO_LARGE')
  }
  return [...frames.values()]
}

export function startActivitySnapshots({ app, source, kinds, read,
  emit = value => console.info(JSON.stringify(value)),
  warn = value => console.warn(JSON.stringify(value)),
  now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout }) {
  let stopped = false
  let timer = null
  let running = false
  function next(delay) {
    if (stopped) return
    timer = schedule(run, delay)
    timer?.unref?.()
  }
  async function run() {
    if (stopped || running) return
    running = true
    try {
      const at = now()
      const rows = await read(calendarWindow(at))
      const snapshot = activitySnapshot({ app, source, kinds, rows, now: at })
      if (!stopped) for (const frame of activityFrames(snapshot, kinds)) emit(frame)
    } catch (error) {
      if (!stopped) warn({
        message: 'observatory.activity.unavailable', version: 1, app, source,
        code: /^[A-Z0-9_]{1,80}$/.test(String(error?.code || '')) ? error.code : 'READ_FAILED'
      })
    } finally {
      running = false
      next(INTERVAL_MS)
    }
  }
  next(30000)
  return () => {
    stopped = true
    if (timer !== null) cancel(timer)
  }
}

