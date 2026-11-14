import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validPaymentAttemptId, newPaymentAttemptId, paymentPayloadDigest,
  paymentRowReference, parsePaymentRowReference
} from '../server/utils/payment-attempt-id.mjs'

test('attempt identifiers are opaque and reject wildcard injection', () => {
  const generated = newPaymentAttemptId()
  assert.equal(validPaymentAttemptId(generated), generated)
  assert.equal(validPaymentAttemptId('PAY-TEST-ABCD%'), '')
  assert.equal(validPaymentAttemptId('PAY-X-Z'), '')
})

test('payload fingerprint is stable across JSON property order but not changed amounts', () => {
  const original = { matricula: 'PM0618', pagos: [{ documento: 3, mes: '11', montoPagado: 250 }], formaDePago: 'Efectivo' }
  const reordered = { formaDePago: 'Efectivo', pagos: [{ montoPagado: 250, mes: '11', documento: 3 }], matricula: 'PM0618' }
  assert.equal(paymentPayloadDigest(original), paymentPayloadDigest(reordered))
  assert.notEqual(paymentPayloadDigest(original), paymentPayloadDigest({ ...original, pagos: [{ ...original.pagos[0], montoPagado: 251 }] }))
})

test('each committed line has a different exact recoverable reference', () => {
  const id = 'PAY-MWGM8F8H-OKHCJ6'
  const hash = paymentPayloadDigest({ matricula: 'PM0618' })
  const first = paymentRowReference(id, hash, 0)
  const second = paymentRowReference(id, hash, 1)
  assert.notEqual(first, second)
  assert.deepEqual(parsePaymentRowReference(first, id), { digest: hash, index: 0 })
  assert.deepEqual(parsePaymentRowReference(second, id), { digest: hash, index: 1 })
  assert.equal(parsePaymentRowReference(first, 'PAY-OTHER-IDID'), null)
})
