import { whatsappApi } from '../../../../utils/whatsapp'

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })
  return await whatsappApi.reconnect(String(clientId))
})
