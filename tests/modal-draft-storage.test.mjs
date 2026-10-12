import test from 'node:test'
import assert from 'node:assert/strict'
import { safeDraftStorage } from '../utils/modalDraftStorage.ts'

test('normal browser draft reads, writes, and clears', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  assert.equal(safeDraftStorage(s => s.setItem('payment', 'pending'), () => storage).ok, true)
  assert.deepEqual(safeDraftStorage(s => s.getItem('payment'), () => storage), { ok: true, value: 'pending' })
  assert.equal(safeDraftStorage(s => s.removeItem('payment'), () => storage).ok, true)
})

test('quota failure does not throw into payment submission', () => {
  const quota = Object.assign(Error('storage full'), { name: 'QuotaExceededError' })
  const storage = { getItem: () => null, setItem: () => { throw quota }, removeItem: () => {} }
  assert.deepEqual(safeDraftStorage(s => s.setItem('payment', 'pending'), () => storage), { ok: false, reason: 'quota' })
})

test('denied read and cleanup never throw', () => {
  const denied = Object.assign(Error('storage disabled'), { name: 'SecurityError' })
  const storage = { getItem: () => { throw denied }, setItem: () => {}, removeItem: () => { throw denied } }
  assert.deepEqual(safeDraftStorage(s => s.getItem('payment'), () => storage), { ok: false, reason: 'security' })
  assert.deepEqual(safeDraftStorage(s => s.removeItem('payment'), () => storage), { ok: false, reason: 'security' })
  assert.deepEqual(safeDraftStorage(s => s.getItem('payment'), () => { throw denied }), { ok: false, reason: 'security' })
})

test('disabled browser storage stays nonfatal', () => {
  assert.deepEqual(safeDraftStorage(s => s.getItem('payment'), () => null), { ok: false, reason: 'unavailable' })
})
