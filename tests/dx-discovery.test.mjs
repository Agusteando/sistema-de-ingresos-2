import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { discoverConsumer, findIntegrationRoute, studentStats, stringLiterals } from '../shared/utils/dxDiscovery.mjs'
import { buildDxRouteManifest } from '../scripts/dx-route-manifest.mjs'

const catalog = buildDxRouteManifest(process.cwd())
const byPath = path => catalog.find(route => route.path === path && route.method === 'GET')
const rosterPath = '/api/external/v1/talleres/roster'

test('inventory follows real handlers and referenced symbols, without attributing unrelated modules', () => {
  assert.ok(catalog.length >= 36)
  assert.ok(byPath(rosterPath).tables.includes('control_external_student_view'))
  assert.ok(byPath('/api/external/v1/control-escolar/students').versions.includes('control-escolar-student-view-v3-sections'))
  assert.deepEqual(byPath('/api/external/v1/control-escolar/operator-roster').tables, [])
})

test('a newly added handler is discovered without editing a catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-route-test-'))
  try {
    fs.mkdirSync(path.join(root, 'server/api/external/next'), { recursive: true })
    fs.writeFileSync(path.join(root, 'server/api/external/next/new-feed.get.ts'), 'export default defineEventHandler(() => ({data: []}))')
    assert.equal(buildDxRouteManifest(root)[0].path, '/api/external/next/new-feed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('discovers an unnamed future consumer, relative HTTP calls and shared MySQL without app entries', () => {
  const files = {
    'migration.config.json': JSON.stringify({ app: 'Nueva aplicación', domains: [{ hostname: 'new.example.test' }] }),
    'server/connection.ts': "const auroraBase='https://aurora.example.test/api/external/v1/talleres'",
    'server/roster.ts': "import {auroraFetch} from './connection'; const SNAPSHOT_TABLE='control_external_student_view'; const VERSION='talleres-roster-v2'; const read=()=>dbQuery(`SELECT * FROM ${SNAPSHOT_TABLE}`); const fetchRoster=()=>auroraFetch('/roster?ciclo=2026'); const cache=()=>dbQuery('INSERT INTO future_student_cache (matricula) VALUES (?)')"
  }
  const result = discoverConsumer({ full_name: 'org/future', revision: 'abc' }, files, catalog)
  assert.equal(result.name, 'Nueva aplicación')
  assert.deepEqual(result.domains, ['new.example.test'])
  assert.ok(result.contracts.some(ref => ref.routeId === 'GET:' + rosterPath))
  assert.ok(!result.contracts.some(ref => ref.routeId.startsWith('OPTIONS:')))
  assert.equal(result.shared[0].table, 'control_external_student_view')
  assert.deepEqual(result.shared[0].versions, ['talleres-roster-v2'])
  assert.equal(result.caches[0].table, 'future_student_cache')
})

test('template origins and variable matriculas resolve to their contract, not changes or OPTIONS', () => {
  const result = discoverConsumer({ full_name: 'org/scanner' }, {
    'scanner.js': 'const aurora=true; const response=fetch(`${origin}/api/external/v1/control-escolar/students/${encodeURIComponent(id)}?${query}`)'
  }, catalog)
  assert.deepEqual(result.contracts.map(ref => ref.routeId), ['GET:/api/external/v1/control-escolar/students/:matricula'])
  assert.equal(findIntegrationRoute(catalog, '/api/external/v1/control-escolar/students/changes', 'GET').path, '/api/external/v1/control-escolar/students/changes')
})

test('mutations are inventoried with their method and never executed by discovery', () => {
  const result = discoverConsumer({ full_name: 'org/client' }, {
    'aurora.ts': "const call=()=>auroraFetch('/api/external/v1/talleres/students/PM001/dias',{method:'PUT', body:{dias:[]}})"
  }, catalog)
  assert.deepEqual(result.contracts.map(ref => ref.routeId), ['PUT:/api/external/v1/talleres/students/:matricula/dias'])
})

test('comments, tests and docs cannot create consumers or fake HTTP references', () => {
  assert.equal(discoverConsumer({ full_name: 'org/none' }, {
    'docs/integration.md': "aurora '/api/external/v1/talleres/roster'",
    'tests/fixture.ts': "auroraFetch('/api/external/v1/talleres/roster')",
    'index.ts': "// Aurora's '/api/external/v1/talleres/roster' is not used\nconst value='ok'"
  }, catalog), null)
  assert.deepEqual(stringLiterals("// someone's comment\nconst a='/hello' /* 'fake' */" ).map(item => item.value), ['/hello'])
})

test('student and group counts preserve campus, level, grade and empty groups', () => {
  assert.deepEqual(studentStats([
    { plantel: 'PM', matricula: '1', nivel: 'Primaria', grado: '1', grupo: 'A' },
    { plantel: 'PM', matricula: '1', nivel: 'Primaria', grado: '1', grupo: 'A' },
    { plantel: 'ST', matricula: '1', nivel: 'Secundaria', grado: '1', grupo: 'A' },
    { plantel: 'PM', matricula: '2', grado: '1', grupo: '' },
    { plantel: 'PM', matricula: '__EMPTY__', snapshotEmpty: true }
  ]), { students: 3, groups: 2, withoutGroup: 1 })
})

test('equal totals can still expose a wrong group, without checksums or silent duplicate overwrites', async () => {
  const { compareStudentRecords } = await import('../shared/utils/dxDiscovery.mjs')
  const left = [{ matricula: 'CT001', plantel: 'CT', grado: '1', grupo: 'EUROPA' }]
  const right = [{ matricula: 'CT001', plantel: 'PREET', grado: '1', grupo: 'ASIA' }]
  const comparison = compareStudentRecords(left, right, { CT: 'PREET' })
  assert.equal(comparison.length, 1)
  assert.equal(comparison[0].diferencia, 'grupo')
  assert.equal(comparison[0].plantel, 'CT / PREET')
  const duplicate = compareStudentRecords([...left, { ...left[0], grupo: 'ASIA' }], right, { CT: 'PREET' })
  assert.match(duplicate[0].diferencia, /Duplicada A/)
  assert.equal(duplicate[0].grupo_A, 'EUROPA | ASIA')
})
