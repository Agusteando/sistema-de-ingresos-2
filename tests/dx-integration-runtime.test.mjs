import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { buildDxRouteManifest } from '../scripts/dx-route-manifest.mjs'
import * as discovery from '../shared/utils/dxDiscovery.mjs'

const load = async (file, mocks, globals = {}) => {
  const context = vm.createContext({ Buffer, URL, URLSearchParams, AbortSignal, ReadableStream, Date, Map, Set, console, ...globals })
  const module = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file, 'utf8')), { context })
  await module.link(async name => {
    const values = mocks[name] || (name === '#dx-routes' ? { default: buildDxRouteManifest(process.cwd()) } : await import(name))
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value) }, { context })
  })
  await module.evaluate()
  return module.namespace
}

test('summaries select the newest scope per campus/version without adding old scopes or inventing zeroes', async () => {
  const calls = []
  const db = async (sql, params) => {
    calls.push({ sql, params })
    if (sql === 'SHOW TABLES') return [{ Tables_in_db: 'control_external_student_view' }]
    if (sql.startsWith('SHOW COLUMNS')) return ['scope_key', 'view_version', 'payload_json', 'matricula', 'grupo'].map(Field => ({ Field }))
    return [
      { plantel: 'PM', scope_key: 'new', view_version: 'v-current', students: 714, groups_count: 24, without_group: 1, generated_at: '2026-10-25T12:00:00Z' },
      { plantel: 'PM', scope_key: 'old', view_version: 'v-current', students: 800, groups_count: 30, without_group: 2, generated_at: '2026-10-20T12:00:00Z' },
      { plantel: 'ST', scope_key: 'st', view_version: 'v-current', students: 0, groups_count: 0, without_group: 0, generated_at: '2026-10-20T12:00:00Z' }
    ]
  }
  const module = await load('server/utils/dx-data.ts', { './control-escolar-central': { controlEscolarCentralQuery: db } })
  const result = await module.summarizeIntegrationData('2026', ['PM', 'ST'], [], [{ id: 'route', tables: ['control_external_student_view'], versions: ['v-current'] }])
  assert.equal(result.sources[0].campuses.PM.students, 714)
  assert.equal(result.sources[0].campuses.PM.alternatives, 1)
  assert.equal(result.sources[0].campuses.ST.students, 0)
  assert.equal(result.sources[0].campuses.GM, undefined)
  assert.ok(calls.every(call => !/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(call.sql)))
  const records = await module.integrationRecords(result.sources[0], ['PM'], '2026')
  assert.ok(calls.at(-1).sql.includes('plantel IN (?)'))
  assert.deepEqual(Array.from(calls.at(-1).params), ['2026', 'v-current', 'PM', 'new'])
  assert.equal(records.incomplete, false)
})

test('records reject a forbidden campus before accessing any source', async () => {
  let accesses = 0
  const module = await load('server/api/control-escolar/dx-api-lab/records.post.ts', {
    '../../../utils/control-escolar': { listControlEscolarPlanteles: async () => ({ planteles: [{ plantel: 'PM' }] }) },
    '../../../../shared/utils/ciclo': { automaticSchoolCycleKey: () => '2026', normalizeCicloKey: value => value.slice(0, 4) },
    '../../../utils/dx-discovery': { integrationDiscovery: () => ({ consumers: [] }), readIntegrationRoutes: async () => [] },
    '../../../utils/dx-inspection': { canInspectRosterRoute: () => false, inspectIntegrationRoster: async () => { accesses++ }, integrationAuthorizedPlanteles: value => value },
    '../../../utils/dx-data': { summarizeIntegrationData: async () => { accesses++; return { sources: [] } }, integrationRecords: async () => { accesses++ } }
  }, { defineEventHandler: value => value, setResponseHeader: () => {}, readBody: async () => ({ plantel: 'ST', ciclo: '2026' }), createError: data => Object.assign(new Error(data.message), data) })
  await assert.rejects(module.default({}), error => error.statusCode === 403)
  assert.equal(accesses, 0)
})

test('usage captures actual scoped response statistics, excludes names/tokens and identifies DX probes', async () => {
  const records = [], logs = [], hooks = {}
  const module = await load('server/plugins/08.integration-usage.ts', {
    h3: { getRequestURL: event => new URL(event.url), getHeader: (event, name) => event.headers[name], getResponseStatus: event => event.status, getQuery: event => event.query },
    '../utils/dx-discovery': { readIntegrationRoutes: async () => buildDxRouteManifest(process.cwd()) },
    '../utils/dx-usage': { dxProbeId: 'internal-probe', rememberIntegrationUse: value => records.push(value) },
    '../../shared/utils/dxDiscovery.mjs': discovery
  }, { defineNitroPlugin: value => value, console: { info: line => logs.push(line) } })
  await module.default({ hooks: { hook: (name, fn) => { hooks[name] = fn } } })
  hooks.beforeResponse({ url: 'https://aurora.example/api/external/v1/control-escolar/students', method: 'GET', status: 200,
    headers: { 'x-aurora-dx-probe': 'internal-probe', authorization: 'Bearer secret' }, query: { plantel: 'PM', ciclo: '2026' }, context: { auroraRequestId: 'req-1', auroraExternalCredential: 'AURORA_API_TOKEN' }
  }, { body: { data: [{ matricula: 'PM001', nombreCompleto: 'Private Name', plantel: 'PM', grado: '1', grupo: 'A' }], pagination: { nextCursor: 'cursor' }, meta: {} } })
  assert.equal(records[0].stats.students, 1)
  assert.equal(records[0].plantel, 'PM')
  assert.equal(records[0].probe, true)
  assert.equal(records[0].partial, true)
  assert.equal(records[0].requestId, 'req-1')
  assert.doesNotMatch(logs.join('\n'), /Private Name|PM001|Bearer secret/)
  records.length = 0
  hooks.beforeResponse({ url: 'https://aurora.example/api/external/v1/control-escolar/students', method: 'GET', status: 200,
    headers: {}, query: { plantel: 'CT', ciclo: '2026' }, context: {}
  }, { body: { data: [{ matricula: 'CT001', plantel: 'PREET', grado: '1', grupo: 'A' }], meta: { plantel: 'PREET' } } })
  assert.equal(records.length, 1, 'canonical campus responses must not create a fabricated zero for their alias')
  assert.equal(records[0].plantel, 'PREET')
  assert.equal(records[0].stats.students, 1)
  records.length = 0
  const failedEvent = { url: 'https://aurora.example/api/external/v1/control-escolar/students', method: 'GET', status: 200,
    headers: {}, query: { plantel: 'PM', ciclo: '2026' }, context: {} }
  hooks.error({ statusCode: 503, data: { code: 'DB_BRIDGE_AGENT_OFFLINE' } }, { event: failedEvent })
  hooks.beforeResponse(failedEvent, { body: { data: [] } })
  assert.equal(records.length, 1)
  assert.equal(records[0].status, 503)
  assert.equal(records[0].errorCode, 'DB_BRIDGE_AGENT_OFFLINE')
})

test('archive discovery streams source without extracting files or reading credentials/assets', async () => {
  const tarFile = (name, text) => {
    const data = Buffer.from(text), header = Buffer.alloc(512)
    header.write(name); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header[156] = 48
    return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)])
  }
  const compressed = gzipSync(Buffer.concat([
    tarFile('root/server/aurora.ts', "const url='/api/external/v1/school-cycle'"),
    tarFile('root/.env', 'GITHUB_TOKEN=secret'), tarFile('root/public/logo.json', '{"fake":true}'), Buffer.alloc(1024)
  ]))
  const module = await load('server/utils/dx-discovery.ts', { '../../shared/utils/dxDiscovery.mjs': discovery })
  const chunks = Array.from({ length: Math.ceil(compressed.length / 7) }, (_, i) => compressed.subarray(i * 7, (i + 1) * 7))
  const result = await module.readArchiveSources(Readable.toWeb(Readable.from(chunks)))
  assert.deepEqual(Object.keys(result), ['server/aurora.ts'])
  assert.doesNotMatch(JSON.stringify(result), /secret|fake/)
  const broken = Readable.from((async function* () { yield compressed.subarray(0, 15); throw new Error('upstream-disconnected') })())
  await assert.rejects(module.readArchiveSources(Readable.toWeb(broken)), /upstream-disconnected/)
})

test('automatic repository discovery accepts a new app and isolates a failed repository', async () => {
  const catalog = buildDxRouteManifest(process.cwd())
  const tarFile = (name, text) => {
    const data = Buffer.from(text), header = Buffer.alloc(512)
    header.write(name); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header[156] = 48
    return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)])
  }
  const archive = gzipSync(Buffer.concat([
    tarFile('repo/migration.config.json', '{"app":"Discovered live"}'),
    tarFile('repo/aurora.ts', "const read=()=>auroraFetch('/api/external/v1/school-cycle')"), Buffer.alloc(1024)
  ]))
  const urls = []
  const fetchMock = async url => {
    urls.push(url)
    if (url.includes('/user/repos')) return { ok: true, json: async () => [{ full_name: 'org/new-app', name: 'new-app', size: 1, default_branch: 'main', pushed_at: 'today' }, { full_name: 'org/failing', size: 1, default_branch: 'main' }] }
    if (url.includes('/failing/')) return { ok: false, status: 403 }
    if (url.includes('/commits/')) return { ok: true, json: async () => ({ sha: 'a'.repeat(40) }) }
    return { ok: true, body: Readable.toWeb(Readable.from([archive])) }
  }
  const module = await load('server/utils/dx-discovery.ts', { '../../shared/utils/dxDiscovery.mjs': discovery }, {
    fetch: fetchMock, process: { env: {} }, useRuntimeConfig: () => ({ githubToken: 'unit-token' }), useStorage: () => ({ getItem: async () => catalog })
  })
  let result = module.integrationDiscovery()
  for (let i = 0; i < 100 && result.running; i++) { await new Promise(resolve => setTimeout(resolve, 2)); result = module.integrationDiscovery() }
  assert.equal(result.running, false)
  assert.equal(result.total, 2)
  assert.equal(result.scanned, 2)
  assert.equal(result.consumers[0].name, 'Discovered live')
  assert.equal(result.consumers[0].revision, 'a'.repeat(40))
  assert.equal(result.failures[0].repository, 'org/failing')
  assert.ok(urls.every(url => url.startsWith('https://api.github.com/')))
  assert.doesNotMatch(JSON.stringify(result), /unit-token/)
})

test('usage retains the last successful result after a failure and scopes history per campus', async () => {
  let calls = 0
  const module = await load('server/utils/dx-usage.ts', {
    './historical-student-audit': { allowedLokiUrl: () => new URL('http://loki.test/loki/api/v1/query_range') }
  }, { process: { env: {} }, fetch: async () => { calls++; return { ok: true, json: async () => ({ status: 'success', data: { result: [] } }) } } })
  const base = { routeId: 'GET:/api/external/new', at: new Date().toISOString(), plantel: 'PM', ciclo: '2026', credential: 'SHARED', probe: false }
  module.rememberIntegrationUse({ ...base, status: 200, stats: { students: 714 } })
  module.rememberIntegrationUse({ ...base, status: 503, stats: null })
  module.rememberIntegrationUse({ ...base, plantel: 'ST', status: 200, stats: { students: 300 } })
  const pm = await module.readIntegrationUse(['PM'])
  assert.equal(pm.records.length, 2)
  assert.ok(pm.records.some(record => record.status === 200 && record.stats.students === 714))
  const requests = calls
  const st = await module.readIntegrationUse(['ST'])
  assert.equal(st.records.length, 1)
  assert.equal(st.records[0].plantel, 'ST')
  assert.equal(calls, requests, 'cached history must not repeat Loki reads per UI discovery poll')
})

test('on-demand roster reads reuse actual GET handlers, deduplicate aliases and filter foreign campuses', async () => {
  const calls = []
  const normalize = campus => ({ CT: 'PREET', CM: 'PREEM' }[campus] || (['PM', 'ST', 'PREET', 'PREEM'].includes(campus) ? campus : ''))
  const module = await load('server/utils/dx-inspection.ts', {
    './dx-api-lab': { tokenForHeader: () => 'unit-token' },
    './dx-usage': { dxProbeId: 'unit-probe' },
    '../../shared/utils/dxDiscovery.mjs': discovery,
    './control-escolar-plantel-routing': { normalizeExternalControlEscolarPlantel: normalize, controlEscolarBridgeAgentCandidates: campus => campus === 'PREET' ? ['CT', 'PREET'] : [campus] },
    './talleres-snapshot': { TALLERES_SNAPSHOT_PLANTELES: ['PM', 'CT'] }
  }, { createError: data => Object.assign(new Error(data.message), data) })
  const result = await module.inspectIntegrationRoster({ $fetch: async (url, options) => {
    calls.push({ url, options }); const plantel = new URL(url, 'http://local').searchParams.get('plantel')
    return { data: [{ matricula: plantel + '001', plantel, grado: '1', grupo: 'A' }, { matricula: 'FOREIGN001', plantel: 'FOREIGN' }], meta: {} }
  } }, { path: '/api/external/v1/control-escolar/operator-roster', method: 'GET' }, ['PM', 'CT', 'PREET', 'DM'], '2026')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.headers['x-aurora-dx-probe'] === 'unit-probe'))
  assert.deepEqual(Array.from(result.rows, row => row.plantel).sort(), ['PM', 'PREET'])
  assert.equal(result.campuses.PREET.students, 1)
  await assert.rejects(module.inspectIntegrationRoster({}, { path: '/api/external/v1/talleres/warm', method: 'POST' }, ['PM'], '2026'), error => error.statusCode === 405)
})
