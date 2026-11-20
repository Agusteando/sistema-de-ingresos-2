import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')

test('Aurora historical daycare integration resolves identity server-side, not from query/body', () => {
  const route = read('server/api/students/[matricula]/daycare-history.get.ts')
  assert.match(route, /getTrustedAuthUser\(event\)/)
  assert.match(route, /fetchCentralMatriculaOverlay\(matricula\)/)
  assert.match(route, /parseCurp\(overlay\.student\.curp\)/)
  assert.match(route, /!user\.isSuperAdmin/)
  assert.match(route, /AURORA_API_TOKEN/)
  assert.match(route, /x-aurora-token/)
  assert.match(route, /AbortSignal\.timeout\(6000\)/)
  assert.match(route, /redirect: 'error'/)
  assert.match(route, /UNITS\[code\]/)
  assert.match(route, /SIAG_UNAVAILABLE/)
  assert.doesNotMatch(route, /readBody\(event\)|getQuery\(event\)/)
})
test('existing authenticated Control Escolar or financial roles can use the read-only overlay', () => {
  const middleware = read('server/middleware/auth.ts')
  assert.match(middleware, /isCentralMatriculaOverlayEndpoint/)
  assert.match(middleware, /daycare-history/)
})
test('financial student profile enriches only positive verified SIAG matches', () => {
  const ui = read('components/StudentDetails.vue')
  assert.match(ui, /daycareHistory\.value = payload/)
  assert.match(ui, /payload\?\.ok === true && payload\?\.found === true/)
  assert.match(ui, /Origen guardería/)
  assert.match(ui, /accountCurpLabel/)
  assert.match(ui, /\/daycare-history/)
})
