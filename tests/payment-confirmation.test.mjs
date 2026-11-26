import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPaymentConfirmation, confirmationPayloadMatches, confirmedPaymentMatches, preserveManualPaymentAmounts, speakPaymentConfirmation } from '../shared/utils/payment-confirmation.mjs'

test('partial amounts survive a refresh; untouched rows still use fresh balances', () => {
  const fresh = [{ id: 1, montoPagado: 3000, montoTouched: false }, { id: 2, montoPagado: 3795, montoTouched: false }]
  const previous = [{ id: 1, montoPagado: 1500, montoTouched: true }, { id: 2, montoPagado: 2000, montoTouched: false }]
  assert.deepEqual(preserveManualPaymentAmounts(fresh, previous, row => row.id), [{ id: 1, montoPagado: 1500, montoTouched: true }, fresh[1]])
})
test('explicit zero stays zero; a different debt never inherits an edit', () => {
  const fresh = [{ id: 1, montoPagado: 3000 }, { id: 3, montoPagado: 2000 }]
  const previous = [{ id: 1, montoPagado: 0, montoTouched: true }, { id: 2, montoPagado: 50, montoTouched: true }]
  assert.deepEqual(preserveManualPaymentAmounts(fresh, previous, row => row.id), [{ id: 1, montoPagado: 0, montoTouched: true }, fresh[1]])
})
test('confirmation adds per-row rounded cents and rejects changed payloads, even with equal totals', () => {
  const payload = { pagos: [{ documento: 1, montoPagado: 1500.125 }, { documento: 2, montoPagado: 2000.125 }] }
  const snapshot = createPaymentConfirmation(payload)
  assert.equal(snapshot.totalCents, 350026)
  assert.equal(confirmationPayloadMatches(snapshot, payload), true)
  payload.pagos[0].documento = 9
  assert.equal(confirmationPayloadMatches(snapshot, payload), false)
})
test('server amount contract prevents full-balance substitution and rejects zero/invalid amounts', () => {
  assert.equal(confirmedPaymentMatches(1500, 3000), false)
  assert.equal(confirmedPaymentMatches(2000, 3795), false)
  assert.equal(confirmedPaymentMatches(1500, 1500), true)
  assert.equal(confirmedPaymentMatches(1.125, 1.13), true)
  assert.equal(confirmedPaymentMatches(0, 0), false)
  assert.equal(confirmedPaymentMatches(NaN, 2000), false)
})
test('speech uses a local Mexican Spanish voice and reads exact pesos and cents', () => {
  let spoken
  let cancelled = false
  const device = { SpeechSynthesisUtterance: class { constructor(text) { this.text = text } }, speechSynthesis: {
    getVoices: () => [{ lang: 'es-MX', localService: false }, { lang: 'es-ES', localService: true }, { lang: 'es-MX', localService: true }],
    speak: value => { spoken = value }, cancel: () => { cancelled = true }
  } }
  const stop = speakPaymentConfirmation(device, 150050)
  assert.equal(spoken.text, 'Confirma pago por 1500 pesos con 50 centavos.')
  assert.equal(spoken.voice.lang, 'es-MX')
  assert.equal(spoken.voice.localService, true)
  stop()
  assert.equal(cancelled, true)
})
test('unsupported, remote-only or failed TTS cannot prevent confirmation', () => {
  assert.doesNotThrow(() => speakPaymentConfirmation(undefined, 200000)())
  assert.doesNotThrow(() => speakPaymentConfirmation({ SpeechSynthesisUtterance: class {}, speechSynthesis: { getVoices: () => [{ lang: 'es-MX', localService: false }], speak: () => { throw new Error('remote voice must never be used') } } }, 200000)())
  assert.doesNotThrow(() => speakPaymentConfirmation({ SpeechSynthesisUtterance: class {}, speechSynthesis: { getVoices: () => { throw new Error('device unavailable') } } }, 200000)())
})
test('modal routes registration through explicit confirmation and API guards the confirmed amount', () => {
  const modal = readFileSync(new URL('../components/PaymentModal.vue', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../server/api/payments/pay.post.ts', import.meta.url), 'utf8')
  assert.equal((modal.match(/<script setup>/g) || []).length, 1)
  assert.equal((modal.match(/<\/style>/g) || []).length, 1)
  assert.equal((modal.match(/const submit =/g) || []).length, 1)
  assert.match(modal, /@click="requestPaymentConfirmation"/)
  assert.match(modal, /@click="confirmPayment"/)
  assert.match(modal, /CONFIRMA PAGO POR/)
  assert.match(modal, /2000/)
  assert.match(modal, /confirmationPayloadMatches\(snapshot, payload\)/)
  assert.match(modal, /confirmarImporte: true/)
  assert.match(api, /body\.confirmarImporte === true/)
  assert.match(api, /confirmedPaymentMatches\(requestedAmountFromClient, requestedAmount\)/)
})
