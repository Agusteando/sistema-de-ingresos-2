import crypto from 'node:crypto'
import { query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'

const normalizeClientIdPart = (value: string) => String(value || 'usuario')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 42) || 'usuario'

const makeStableClientId = (user: any, provided?: unknown) => {
  const explicit = String(provided || '').trim()
  if (explicit) return explicit

  const basis = `${user?.email || user?.name || 'usuario'}:${user?.active_plantel || 'global'}:sistema-de-ingresos`
  const hash = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12)
  return `sdi-${normalizeClientIdPart(user?.email || user?.name || 'usuario')}-${hash}`
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const body = await readBody(event)
  const clientId = makeStableClientId(user, body?.clientId)
  const displayName = String(body?.displayName || `Cobranza ${user?.name || user?.email || ''}`).trim()

  if (!displayName) {
    throw createError({ statusCode: 400, statusMessage: 'displayName es requerido.' })
  }

  const response = await whatsappApi.createInstance(clientId, displayName)
  const instance = response?.instance || response

  await query(
    `INSERT INTO cobranza_whatsapp_clients
      (client_id, integration_id, status, display_name, user_email, endpoint_status, endpoint_qr_status, endpoint_qr_stream, endpoint_send_message, metadata, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE integration_id = VALUES(integration_id), status = VALUES(status), display_name = VALUES(display_name), user_email = VALUES(user_email), endpoint_status = VALUES(endpoint_status), endpoint_qr_status = VALUES(endpoint_qr_status), endpoint_qr_stream = VALUES(endpoint_qr_stream), endpoint_send_message = VALUES(endpoint_send_message), metadata = VALUES(metadata), updated_at = NOW()`,
    [
      instance.clientId || clientId,
      instance.integrationId || null,
      instance.status || 'pending',
      displayName,
      user.email,
      instance.endpoints?.status || null,
      instance.endpoints?.qrStatus || null,
      instance.endpoints?.qrStream || null,
      instance.endpoints?.sendMessage || null,
      JSON.stringify({ ...instance, onboarding: true, source: 'sistema-de-ingresos' })
    ]
  )

  return {
    ...response,
    instance: {
      ...instance,
      clientId: instance.clientId || clientId,
      displayName
    }
  }
})
