import { runWithBridgeAgentId } from '../../../../utils/db'
import crypto from 'node:crypto'
import { whatsappApi } from '../../../../utils/whatsapp'
import { assertWhatsappClientOwnership } from '../../../../utils/whatsappOwnership'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const clientId = event.context.params?.clientId
  const body = await readBody(event)
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })
  await assertWhatsappClientOwnership(String(clientId), event.context.user)

  const idem = String(body?.idempotencyKey || crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex'))
  const payload = { ...body }
  delete payload.idempotencyKey

  return await whatsappApi.sendMessage(String(clientId), payload, idem)
}))
