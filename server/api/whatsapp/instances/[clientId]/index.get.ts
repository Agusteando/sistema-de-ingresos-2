import { runWithBridgeAgentId } from '../../../../utils/db'
import { whatsappApi } from '../../../../utils/whatsapp'
import { assertWhatsappClientOwnership } from '../../../../utils/whatsappOwnership'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })
  await assertWhatsappClientOwnership(String(clientId), event.context.user)
  return await whatsappApi.getInstance(String(clientId))
}))
