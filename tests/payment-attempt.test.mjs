import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validPaymentAttemptId, newPaymentAttemptId, paymentPayloadDigest,
  paymentRowReference, parsePaymentRowReference, classifyPaymentAttemptRows
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

test('committed receipts are exact, ordered and cancellation is never confirmed', () => {
  const id = 'PAY-MWGM8F8H-OKHCJ6'
  const digest = paymentPayloadDigest({ matricula: 'PM0618', pagos: [1, 2] })
  const rows = [0, 1].map((index) => ({
    folio: 451 + index, matricula: 'PM0618', estatus: 'Vigente',
    referencia: paymentRowReference(id, digest, index)
  }))
  assert.deepEqual(classifyPaymentAttemptRows(rows, id, 'PM0618', digest).folios, [451, 452])
  assert.equal(classifyPaymentAttemptRows(rows, id, 'PM0618', digest).status, 'confirmed')
  assert.equal(classifyPaymentAttemptRows(rows, id, 'PM9999', digest).status, 'conflict')
  assert.equal(classifyPaymentAttemptRows(rows, id, 'PM0618', paymentPayloadDigest({ different: true })).status, 'conflict')
  assert.equal(classifyPaymentAttemptRows([rows[1]], id, 'PM0618', digest).status, 'conflict')
  assert.equal(classifyPaymentAttemptRows([{ ...rows[0], estatus: 'Cancelada' }], id, 'PM0618', digest).status, 'cancelled')
  assert.equal(classifyPaymentAttemptRows([], id, 'PM0618', digest).status, 'missing')
})
