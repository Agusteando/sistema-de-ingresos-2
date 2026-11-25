import { test } from 'node:test'
import assert from 'node:assert/strict'
import { centralPingUrl, probeCentralConnectivity } from '../utils/centralConnectivity.mjs'

test('cloud probes its origin, local probes the configured central origin', () => {
  assert.equal(centralPingUrl(false, 'https://central.example'), '/api/connectivity/ping')
  assert.equal(centralPingUrl(true, 'https://central.example/'), 'https://central.example/api/connectivity/ping')
})

test('only fresh valid central responses report reachable', async () => {
  const signal = new AbortController().signal
  const url = 'https://central.example/api/connectivity/ping'
  const probe = fetchImpl => probeCentralConnectivity(url, signal, fetchImpl, 123)
  assert.equal(await probe(async (target, options) => {
    assert.equal(target, url + '?_=123')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    assert.equal(options.signal, signal)
    return { ok: true, json: async () => ({ ok: true }) }
  }), true)
  assert.equal(await probe(async () => ({ ok: false, json: async () => ({ ok: true }) })), false)
  assert.equal(await probe(async () => ({ ok: true, json: async () => ({ ok: false }) })), false)
  assert.equal(await probe(async () => ({ ok: true, json: async () => { throw Error('HTML') } })), false)
  assert.equal(await probe(async () => { throw Error('network down') }), false)
  assert.equal(await probe(async () => { throw Error('timeout') }), false)
  assert.equal(await probe(async () => ({ ok: true, json: async () => ({ ok: true }) })), true)
})

test('an aborted request cannot report reachable', async () => {
  const controller = new AbortController()
  controller.abort()
  assert.equal(await probeCentralConnectivity('/api/connectivity/ping', controller.signal,
    async () => ({ ok: true, json: async () => ({ ok: true }) }), 123), false)
})
