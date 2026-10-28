import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activityFrames, activitySnapshot, calendarWindow, startActivitySnapshots } from '../server/observatory/runtime.mjs'
import * as source from '../server/observatory/source.mjs'

const now = Date.parse('2026-10-28T08:00:00-06:00')
const period = calendarWindow(now)
const definitions = source.definitions || [source]
const sourceGuards = {
  control_escolar_audit_events: [/actor_email/, /husky_pass_family_profile/, /source_flow IN/]
}

test('retrospective dates, privacy, and bounded read-only source queries', () => {
  assert.equal(new Date(period.start * 1000).toISOString(), '2026-10-15T06:00:00.000Z')
  assert.equal(new Date(period.end * 1000).toISOString(), '2026-10-28T14:00:00.000Z')
  for (const definition of definitions) {
    const query = definition.activityQuery(period)
    assert.match(query.sql, /^SELECT /)
    assert.match(query.sql, /MAX_EXECUTION_TIME\(2500\)/)
    assert.doesNotMatch(query.sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/)
    assert.equal((query.sql.match(/\?/g) || []).length, query.values.length)
    assert.equal(query.timeout, 4000)
    for (const guard of sourceGuards[definition.source] || []) assert.match(query.sql, guard)
    if (definition.source === 'control_escolar_audit_events') {
      assert.ok(query.values.includes('aurora_control_escolar_write'))
      assert.ok(query.values.includes('husky_pass_family_profile'))
      assert.ok(!query.values.includes('husky_pass_marketing_parent_update'))
    }
    const kind = definition.kinds[0]
    const snapshot = activitySnapshot({ app: source.app, source: definition.source,
      kinds: definition.kinds, rows: [{kind, bucket_end: period.start + 3600, count: '2',
        actor_email: 'private@example.invalid'}], now })
    const frames = activityFrames(snapshot, definition.kinds)
    assert.equal(frames[0].values[0], 2)
    assert.equal(frames[0].values[1], null)
    assert.ok(frames.every(frame => Buffer.byteLength(JSON.stringify(frame)) < 12000))
    assert.ok(!JSON.stringify(frames).includes('private@example.invalid'))
  }
})

test('a failed read never emits fabricated hours and shutdown cancels retries', async () => {
  const pending = [], events = [], warnings = [], cancelled = []
  const definition = definitions[0]
  const stop = startActivitySnapshots({ app: source.app, source: definition.source,
    kinds: definition.kinds, now: () => now,
    read: async () => { throw new Error('private connection detail') },
    emit: frame => events.push(frame), warn: warning => warnings.push(warning),
    schedule: (fn, delay) => {const timer = {fn, delay, unref() {}}; pending.push(timer); return timer},
    cancel: timer => cancelled.push(timer)
  })
  assert.equal(pending[0].delay, 30000)
  await pending.shift().fn()
  assert.deepEqual(events, [])
  assert.equal(warnings[0].code, 'READ_FAILED')
  assert.ok(!JSON.stringify(warnings).includes('private connection'))
  assert.equal(pending[0].delay, 600000)
  stop()
  assert.equal(cancelled.length, 1)
})
