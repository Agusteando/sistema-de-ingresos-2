import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { requestRecargoTelegramAuthorization, consumeRecargoTelegramAuthorization, waivedTargetsFromPayload } from '../server/utils/recargo-telegram-authorization.mjs'

const payload = () => ({
  matricula: 'PT0001', ciclo: '2026-2027', formaDePago: 'Efectivo',
  pagos: [{ documento: 101, mes: '3', montoPagado: 1000, omitirRecargo: true },
    { documento: 102, mes: '3', montoPagado: 300, omitirRecargo: false }],
})
const request = (p = payload(), now = 10000) => requestRecargoTelegramAuthorization({
  actor: 'caja@escuela.edu.mx', agent: 'PT', reference: 'PAY-ABCDEF-ABCDEF',
  payload: p, reason: 'Autorización especial', message: code => 'Código: ' + code,
  notify: async () => ({ delivered: true }), now,
})

test('code bound to actor, campus, payment attempt, exact payload and expiry', async () => {
  const p = payload()
  const { requestId } = await request(p)
  const proof = { requestId, code: '00000', actor: 'caja@escuela.edu.mx',
    agent: 'PT', reference: 'PAY-ABCDEF-ABCDEF', payload: p, now: 10001 }
  assert.throws(() => consumeRecargoTelegramAuthorization({ ...proof, actor: 'other@escuela.edu.mx' }), /no corresponde/)
  assert.throws(() => consumeRecargoTelegramAuthorization({ ...proof, agent: 'SM' }), /no corresponde/)
  assert.throws(() => consumeRecargoTelegramAuthorization({ ...proof, reference: 'PAY-NEW-NEW' }), /no corresponde/)
  assert.throws(() => consumeRecargoTelegramAuthorization({ ...proof, payload: {
    ...p, pagos: [{ ...p.pagos[0], montoPagado: 999 }, p.pagos[1]],
  } }), /no corresponde/)
  assert.throws(() => consumeRecargoTelegramAuthorization({ ...proof, now: 610001 }), /expirada/)
})

test('correct code authorizes only selected targets once; three errors block a code', async () => {
  const p = payload()
  let code
  const auth = await requestRecargoTelegramAuthorization({
    actor: 'one@escuela.edu.mx', agent: 'PT', reference: 'PAY-12345-12345',
    payload: p, reason: 'Corrección autorizada', message: c => { code = c; return c },
    notify: async () => ({ delivered: true }), now: 20000,
  })
  const proof = { requestId: auth.requestId, code, actor: 'one@escuela.edu.mx', agent: 'PT',
    reference: 'PAY-12345-12345', payload: p, now: 20001 }
  const granted = consumeRecargoTelegramAuthorization(proof)
  assert.deepEqual([...granted.targets], [waivedTargetsFromPayload(p)[0].key])
  assert.throws(() => consumeRecargoTelegramAuthorization(proof), /expirada/)
  const denied = await request(p, 40000)
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.throws(() => consumeRecargoTelegramAuthorization({
      ...proof, requestId: denied.requestId, actor: 'caja@escuela.edu.mx',
      reference: 'PAY-ABCDEF-ABCDEF', code: 'x', now: 40001,
    }), attempt === 2 ? /bloqueado/ : /incorrecto/)
  }
})

test('unconfirmed Telegram delivery and invalid/duplicated waiver targets fail closed', async () => {
  await assert.rejects(requestRecargoTelegramAuthorization({
    actor: 'fail@escuela.edu.mx', agent: 'PT', reference: 'PAY-ABCDEF-ABCDEF',
    payload: payload(), reason: 'Solicitud especial', message: c => c,
    notify: async () => ({ delivered: false }), now: 50000,
  }), /No se pudo enviar/)
  assert.throws(() => waivedTargetsFromPayload({ pagos: [
    { documento: 1, mes: '3', omitirRecargo: true },
    { documento: 1, mes: '3', omitirRecargo: true },
  ] }), /válidos/)
})

test('payment handler still enforces the recargo calculation and exact Telegram authorization', async () => {
  const [pay, modal, requestApi] = await Promise.all([
    readFile('server/api/payments/pay.post.ts', 'utf8'),
    readFile('components/PaymentModal.vue', 'utf8'),
    readFile('server/api/payments/recargo-authorization.post.ts', 'utf8'),
  ])
  assert.match(pay, /consumeRecargoTelegramAuthorization/)
  assert.match(pay, /waiverTargets\.has\(paymentDuplicateKey\)/)
  assert.match(pay, /resolveLateFeeBalance/)
  assert.match(pay, /readPaymentAttempt/)
  assert.match(modal, /x-recargo-request-id/)
  assert.match(modal, /requiresRecargoAuthorization/)
  assert.match(requestApi, /loadStudentDebts/)
  assert.match(requestApi, /notifyDocumentAmountCorrection/)
  assert.doesNotMatch(requestApi, /setGlobalRecargoRemovalOverride/)
})
