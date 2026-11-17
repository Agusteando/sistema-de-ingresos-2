import { randomInt, randomUUID } from 'node:crypto'
import { paymentPayloadDigest } from './payment-attempt-id.mjs'

// Keep identical target semantics to shared/utils/paymentTarget.ts (ev = month 1).
const targetKey = (documento, mes) => String(Number(documento)) + ':' + String(mes === 'ev' ? 1 : Number(mes))
const pending = new Map()
const recent = new Map()
const TTL = 600000
const deny = (statusCode, message) => Object.assign(new Error(message), { statusCode })
const truthy = value => ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())

export const waivedTargetsFromPayload = payload => {
  const waived = (Array.isArray(payload?.pagos) ? payload.pagos : []).filter(p => truthy(p?.omitirRecargo))
  const targets = waived.map(p => {
    const documento = Number(p.documento)
    const mes = String(p.mes || '').trim().toLowerCase()
    return { documento, mes, key: targetKey(documento, mes) }
  })
  if (!targets.length || targets.length > 20 || targets.some(t =>
    !Number.isSafeInteger(t.documento) || t.documento <= 0 ||
    (t.mes !== 'ev' && !/^(?:[1-9]|1[0-2])$/.test(t.mes))
  ) || new Set(targets.map(t => t.key)).size !== targets.length) {
    throw deny(400, 'Selecciona recargos válidos de este pago para solicitar autorización.')
  }
  return targets
}

const prune = now => {
  for (const [id, item] of pending) if (item.expiresAt <= now) pending.delete(id)
  for (const [actor, timestamps] of recent) {
    const retained = timestamps.filter(t => t > now - TTL)
    if (retained.length) recent.set(actor, retained)
    else recent.delete(actor)
  }
}

// Scoped, single-use authorization: follows Aurora's existing depuración Telegram flow.
export const requestRecargoTelegramAuthorization = async ({
  actor, agent, reference, payload, reason, message, notify, now = Date.now(),
}) => {
  prune(now)
  if (!actor || !agent || !reference || !reason || !payload || typeof notify !== 'function') {
    throw deny(400, 'Solicitud de autorización incompleta.')
  }
  const timestamps = recent.get(actor) || []
  if (timestamps.length >= 5) throw deny(429, 'Demasiadas solicitudes. Vuelve a intentarlo más tarde.')
  const targets = waivedTargetsFromPayload(payload)
  const code = String(randomInt(10000, 100000))
  const requestId = randomUUID()
  const delivery = await notify(message(code))
  if (!delivery?.delivered) throw deny(502, 'No se pudo enviar el código por Telegram. No se autorizó el retiro.')
  for (const [id, item] of pending) {
    if (item.actor === actor && item.reference === reference) pending.delete(id)
  }
  pending.set(requestId, {
    actor, agent, reference, digest: paymentPayloadDigest(payload), reason,
    targets: targets.map(t => t.key), code, attempts: 0, expiresAt: now + TTL,
  })
  recent.set(actor, [...timestamps, now])
  return { requestId, expiresInSeconds: 600 }
}

export const consumeRecargoTelegramAuthorization = ({
  requestId, code, actor, agent, reference, payload, now = Date.now(),
}) => {
  const id = String(requestId || '')
  const item = pending.get(id)
  if (!item || item.expiresAt <= now) {
    pending.delete(id)
    throw deny(409, 'Autorización expirada. Solicita un nuevo código de Telegram.')
  }
  if (!actor || item.actor !== actor || item.agent !== agent || item.reference !== reference ||
      item.digest !== paymentPayloadDigest(payload)) {
    throw deny(403, 'La autorización no corresponde a este operador, plantel o cobro.')
  }
  item.attempts += 1
  if (!/^\d{5}$/.test(String(code || '')) || String(code) !== item.code) {
    if (item.attempts >= 3) pending.delete(id)
    throw deny(403, item.attempts >= 3 ? 'Código bloqueado. Solicita uno nuevo.' : 'Código de Telegram incorrecto.')
  }
  pending.delete(id)
  return { targets: new Set(item.targets), reason: item.reason, requestId: id }
}
