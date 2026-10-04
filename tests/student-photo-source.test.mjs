import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import crypto from 'node:crypto'

const source = readFileSync(new URL('../server/api/students/[matricula]/photo.get.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default defineEventHandler', 'globalThis.handler = defineEventHandler')
const javascript = ts.transpile(source, { target: ts.ScriptTarget.ES2022 })

function setup(config, externalStatus = 200) {
  const requests = []
  const headers = {}
  const event = { context: { params: { matricula: 'PT123' } }, status: 200 }
  const context = createContext({
    URL, AbortController, setTimeout, clearTimeout, crypto,
    console: { error() {} },
    useRuntimeConfig: () => config,
    getExternalSyncConfig: () => ({ apiKey: config.externalSyncApiKey || '' }),
    cleanApiKey: value => String(value || '').trim().replace(/^Bearer\s+/i, ''),
    buildExternalHeaders: ({ apiKey }) => ({ Accept: 'application/json', Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey }),
    defineEventHandler: fn => fn,
    runWithBridgeAgentId: (_id, fn) => fn(),
    getQuery: () => ({ format: 'json' }),
    getRequestHeader: () => undefined,
    setResponseStatus: (event, status) => { event.status = status },
    setResponseHeader: (_event, key, value) => { headers[key] = value },
    fetch: async (url, options) => {
      requests.push({ url, headers: options.headers })
      return { status: externalStatus, ok: externalStatus === 200, json: async () => ({ photoUrl: '/uploads/portrait.jpg' }) }
    }
  })
  runInContext(javascript, context)
  return { invoke: () => context.handler(event), event, requests, headers }
}

test('dedicated photo key preserves the external URL and both auth headers', async () => {
  const s = setup({ studentPhotoApiKey: 'photo-key', externalSyncApiKey: 'sync-key' })
  const result = await s.invoke()
  assert.equal(result.photoUrl, 'https://matricula.casitaapps.com/uploads/portrait.jpg')
  assert.equal(s.requests[0].url, 'https://matricula.casitaapps.com/api/students/PT123/photo?format=json')
  assert.equal(s.requests[0].headers.Authorization, 'Bearer photo-key')
  assert.equal(s.requests[0].headers['x-api-key'], 'photo-key')
})

test('existing sync key remains the fallback', async () => {
  const s = setup({ externalSyncApiKey: 'sync-key' })
  await s.invoke()
  assert.equal(s.requests[0].headers.Authorization, 'Bearer sync-key')
})

test('missing configuration is retryable, never cached as a missing student photo', async () => {
  const s = setup({})
  const result = await s.invoke()
  assert.equal(s.event.status, 503)
  assert.equal(result.error.code, 'EXTERNAL_PHOTO_NOT_CONFIGURED')
  assert.equal(s.headers['Cache-Control'], 'no-store')
  assert.equal(s.requests.length, 0)
})

test('source rejection is retryable; only genuine missing photos return 404', async () => {
  for (const status of [401, 403, 503, 404]) {
    const s = setup({ externalSyncApiKey: 'sync-key' }, status)
    await s.invoke()
    assert.equal(s.event.status, status === 404 ? 404 : 502)
    assert.equal(s.headers['Cache-Control'], status === 404 ? 'private, max-age=60' : 'no-store')
  }
})
