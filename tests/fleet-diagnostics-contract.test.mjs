import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = relative => readFileSync(fileURLToPath(new URL('../' + relative, import.meta.url)), 'utf8')
const endpoint = read('server/api/admin/sql-console/agents.get.ts')
const page = read('pages/estado-equipos.vue')
const layout = read('layouts/default.vue')

test('fleet diagnostics remain Super Admin-only and use the protected relay', () => {
  assert.match(endpoint, /requireSqlConsoleAdmin\(event\)/)
  assert.match(endpoint, /sqlConsoleRelay\(event, '\/agents\/diagnostics'\)/)
  assert.match(endpoint, /relaySupportsDiagnostics/)
  assert.match(endpoint, /agent\.online === true/)
  assert.match(endpoint, /lastSeenAt/)
})

test('legacy relay fallback preserves existing versions panel', () => {
  assert.match(endpoint, /statusCode\) !== 404/)
  assert.match(endpoint, /sqlConsoleRelay\(event, '\/agents'\)/)
  assert.match(endpoint, /observed: Boolean\(agent\)/)
})

test('UI does not equate a connected agent with healthy Aurora Local', () => {
  assert.match(page, /a\.online && a\.telemetry === 'live' && a\.diagnostics\?\.aurora === 'ready'/)
  assert.match(page, /agent\.online \|\| agent\.telemetry !== 'live'/)
  assert.match(page, /Sin verificar/)
  assert.match(page, /Sin registro/)
  assert.match(page, /diagnóstico histórico/i)
  assert.match(layout, /to="\/estado-equipos"[^>]*v-if="isSuperAdmin"/)
})
