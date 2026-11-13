import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createConnectivitySignal, advanceConnectivitySignal, connectivityNoticeText,
  OUTAGE_TEXT, INTERMITTENT_TEXT, classifyConnectivityProbes
} from '../utils/serverConnectivitySignal.mjs'
const day = '2026-11-13'
const next = (state, outcome, date = day) => advanceConnectivitySignal(state, outcome, date)
const drive = (state, outcomes, date = day) => outcomes.reduce((current, outcome) => next(current, outcome, date), state)
test('nothing appears before three confirmed failures', () => {
  const initial = createConnectivitySignal(day)
  assert.equal(connectivityNoticeText(initial), '')
  assert.equal(connectivityNoticeText(drive(initial, ['down','down'])), '')
})
test('third corroborated failure shows first incident', () => {
  const s = drive(createConnectivitySignal(day), ['down','down','down'])
  assert.equal(connectivityNoticeText(s), OUTAGE_TEXT)
  assert.equal(s.episodes, 1)
})
test('a healthy probe resets failure streak and clears the alert', () => {
  const s = drive(createConnectivitySignal(day), ['down','down','up','down','down','down'])
  assert.equal(s.episodes, 1)
  assert.equal(next(s, 'up').active, false)
})
test('unknown browser connectivity is not counted as an outage', () => {
  const s = drive(createConnectivitySignal(day), ['unknown','unknown','down','unknown','down','down'])
  assert.equal(connectivityNoticeText(s), OUTAGE_TEXT)
  assert.equal(connectivityNoticeText(next(s, 'unknown')), OUTAGE_TEXT)
})
test('a second outage after recovery displays intermittent message', () => {
  const s = drive(createConnectivitySignal(day), ['down','down','down','up','down','down','down'])
  assert.equal(s.episodes, 2)
  assert.equal(connectivityNoticeText(s), INTERMITTENT_TEXT)
})
test('extra failed polls do not inflate episode counter', () => {
  const s = drive(createConnectivitySignal(day), ['down','down','down','down','down'])
  assert.equal(s.episodes, 1)
})
test('new day resets count but preserves ongoing outage', () => {
  const s = drive(createConnectivitySignal(day), ['down','down','down','up','down','down','down'])
  const nextDay = next(s, 'down', '2026-11-14')
  assert.equal(nextDay.episodes, 1)
  assert.equal(connectivityNoticeText(nextDay), OUTAGE_TEXT)
})
test('reloading during active incident does not invent another episode', () => {
  const s = createConnectivitySignal(day, { day, episodes: 1, active: true })
  assert.equal(drive(s, ['down','down','down']).episodes, 1)
})
test('reloading after observed recovery preserves the daily episode count', () => {
  const s = createConnectivitySignal(day, { day, episodes: 1, active: false })
  assert.equal(drive(s, ['down','down','down']).episodes, 2)
})
test('invalid and previous-day session history is ignored', () => {
  assert.equal(createConnectivitySignal(day, { day, episodes: -200, active: true }).episodes, 0)
  assert.equal(createConnectivitySignal(day, { day: '2026-11-12', episodes: 5, active: true }).episodes, 0)
})
test('a reachable Aurora origin never means a Totalplay issue', () => {
  assert.equal(classifyConnectivityProbes({ auroraReachable: true, relayReachable: false, independentInternetReachable: true }), 'up')
})
test('two server origins must be unreachable while reference Internet works', () => {
  assert.equal(classifyConnectivityProbes({ auroraReachable: false, relayReachable: false, independentInternetReachable: true }), 'down')
  assert.equal(classifyConnectivityProbes({ auroraReachable: false, relayReachable: true, independentInternetReachable: true }), 'unknown')
  assert.equal(classifyConnectivityProbes({ auroraReachable: false, relayReachable: false, independentInternetReachable: false }), 'unknown')
})
