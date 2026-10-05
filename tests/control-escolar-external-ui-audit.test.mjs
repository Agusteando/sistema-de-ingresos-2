import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('external UI audit trace is token protected and publishes counters without actor identity', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'server/api/external/v1/control-escolar/ui-audit-latest.get.ts'),
    'utf8'
  )
  assert.match(source, /assertAuroraExternalApiToken\(event\)/)
  assert.match(source, /event_type = 'page_snapshot'/)
  assert.match(source, /ORDER BY created_at DESC/)
  assert.match(source, /totalInscritos/)
  assert.match(source, /totalRows/)
  assert.doesNotMatch(source, /actor_email/)
  assert.doesNotMatch(source, /actor_name/)
})
