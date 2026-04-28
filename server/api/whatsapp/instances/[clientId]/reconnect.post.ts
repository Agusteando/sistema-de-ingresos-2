import { query } from '../../../../utils/db'
import { whatsappApi } from '../../../../utils/whatsapp'

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })

  const response = await whatsappApi.reconnect(String(clientId))
  const instance = response?.instance || response

  await query(
    `UPDATE cobranza_whatsapp_clients
     SET status = ?, metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.lastReconnect', ?, '$.lastReconnectAt', CAST(NOW() AS CHAR)), updated_at = NOW()
     WHERE client_id = ?`,
    [String(instance?.status || 'pending'), JSON.stringify(response), String(clientId)]
  )

  return response
})
