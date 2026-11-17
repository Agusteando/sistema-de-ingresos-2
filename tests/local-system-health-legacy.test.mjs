import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { shouldCheckCentralForLocalHealth } from '../server/utils/local-system-health-compat.mjs'

test('legacy Windows managers with no query retain actual central health evidence', () => {
  assert.equal(shouldCheckCentralForLocalHealth(undefined), true)
  assert.equal(shouldCheckCentralForLocalHealth(null), true)
  assert.equal(shouldCheckCentralForLocalHealth(''), true)
  assert.equal(shouldCheckCentralForLocalHealth('1'), true)
})

test('modern managers skip central network checks via explicit query flag', () => {
  assert.equal(shouldCheckCentralForLocalHealth('0'), false)
  assert.equal(shouldCheckCentralForLocalHealth(['0']), false)
  assert.equal(shouldCheckCentralForLocalHealth(0), false)
})

test('legacy health compatibility does not fabricate central health or change local readiness', () => {
  const legacyAccepts = result => Boolean(result.ok && result.transport === 'direct' && result.mysql?.ok && result.central?.ok)
  const localReady = { ok: true, transport: 'direct', mysql: { ok: true } }
  assert.equal(legacyAccepts({ ...localReady, central: { checked: false, ok: false } }), false)
  assert.equal(legacyAccepts({ ...localReady, central: { checked: true, ok: true } }), true)
  assert.equal(legacyAccepts({ ...localReady, central: { checked: true, ok: false } }), false)

  // Read the actual handler: the central result must not gate HTTP 200.
  const source = readFileSync(fileURLToPath(new URL('../server/api/system/health.get.ts', import.meta.url)), 'utf8')
  assert.match(source, /shouldCheckCentralForLocalHealth\(getQuery\(event\)\.central\)/)
  assert.match(source, /const ok = mysqlOk\b/)
  assert.doesNotMatch(source, /const ok = mysqlOk\s*&&\s*centralOk/)
  assert.match(source, /ok: centralOk/)
})
