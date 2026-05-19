import { runWithBridgeAgentId } from '../../../../utils/db'
import { whatsappApi } from '../../../../utils/whatsapp'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })
  return await whatsappApi.getInstance(String(clientId))
}))
