import { query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const { clientId, displayName } = await readBody(event)

  if (!clientId || !displayName) {
    throw createError({ statusCode: 400, statusMessage: 'clientId y displayName son requeridos.' })
  }

  const response = await whatsappApi.createInstance(String(clientId), String(displayName))
  const instance = response?.instance || response

  await query(
    `INSERT INTO cobranza_whatsapp_clients
      (client_id, integration_id, status, display_name, user_email, endpoint_status, endpoint_qr_status, endpoint_qr_stream, endpoint_send_message, metadata, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE integration_id = VALUES(integration_id), status = VALUES(status), display_name = VALUES(display_name), user_email = VALUES(user_email), endpoint_status = VALUES(endpoint_status), endpoint_qr_status = VALUES(endpoint_qr_status), endpoint_qr_stream = VALUES(endpoint_qr_stream), endpoint_send_message = VALUES(endpoint_send_message), metadata = VALUES(metadata), updated_at = NOW()`,
    [
      instance.clientId,
      instance.integrationId || null,
      instance.status || 'pending',
      String(displayName),
      user.email,
      instance.endpoints?.status || null,
      instance.endpoints?.qrStatus || null,
      instance.endpoints?.qrStream || null,
      instance.endpoints?.sendMessage || null,
      JSON.stringify(instance || {})
    ]
  )

  return response
})
