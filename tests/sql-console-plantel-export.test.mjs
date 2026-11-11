import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('SQL console export cannot fall back to Aurora central MySQL', () => {
  const download = read('server/api/admin/sql-console/export.get.ts')
  const start = read('server/api/admin/sql-console/export/start.post.ts')
  const policy = read('server/utils/sql-console-bridge.ts')
  const screen = read('pages/sql-console.vue')
  for (const source of [download, start]) {
    assert.match(source, /ensureSqlBridgeMode\(\)/)
    assert.match(source, /sqlExportPlantel\(/)
    assert.doesNotMatch(source, /mysqlHost|mysqlPassword|SQL_EXPORT_DATABASE|createFullSqlSnapshot/)
  }
  assert.match(policy, /getDbTransport\(\) !== 'bridge'/)
  assert.match(policy, /DB Bridge; no se usará una conexión alternativa/)
  assert.match(screen, /targetPlantel: plantel/)
  assert.match(screen, /\/api\/admin\/sql-console\/export\/start/)
  assert.match(screen, /\/api\/admin\/sql-console\/export\/status/)
  assert.match(screen, /URLSearchParams/)
})

test('agent commit reporting shows only actual SHA, never current repo main', () => {
  const endpoint = read('server/api/admin/sql-console/agents.get.ts')
  const screen = read('pages/sql-console.vue')
  assert.match(endpoint, /agent\.commitSha/)
  assert.match(endpoint, /\[a-f0-9\]\{40\}/)
  assert.match(screen, /SHA no reportado/)
  assert.match(screen, /Sin conexión/)
})
