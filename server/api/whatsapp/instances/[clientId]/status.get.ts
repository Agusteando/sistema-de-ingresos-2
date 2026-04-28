import { query } from '../../../../utils/db'
import { whatsappApi } from '../../../../utils/whatsapp'

const extractStatus = (payload: any) => {
  return payload?.instance?.status || payload?.status?.status || payload?.status || 'pending'
}

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })

  const response = await whatsappApi.getStatus(String(clientId))
  const status = String(extractStatus(response))

  await query(
    `UPDATE cobranza_whatsapp_clients
     SET status = ?, metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.lastStatus', ?, '$.lastStatusAt', CAST(NOW() AS CHAR)), updated_at = NOW()
     WHERE client_id = ?`,
    [status, JSON.stringify(response), String(clientId)]
  )

  return response
})
