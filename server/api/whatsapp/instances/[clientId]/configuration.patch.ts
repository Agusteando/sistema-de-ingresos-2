import { query } from '../../../../utils/db'
import { whatsappApi } from '../../../../utils/whatsapp'

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })

  const body = await readBody(event)
  const response = await whatsappApi.updateConfiguration(String(clientId), body || {})
  const instance = response?.instance || response

  await query(
    `UPDATE cobranza_whatsapp_clients
     SET display_name = COALESCE(?, display_name),
         status = COALESCE(?, status),
         metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.lastConfiguration', ?, '$.lastConfigurationAt', CAST(NOW() AS CHAR)),
         updated_at = NOW()
     WHERE client_id = ?`,
    [
      instance?.displayName || body?.displayName || null,
      instance?.status || null,
      JSON.stringify({ request: body || {}, response }),
      String(clientId)
    ]
  )

  return response
})
