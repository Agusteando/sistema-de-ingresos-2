import crypto from 'node:crypto'
import { whatsappApi } from '../../../../utils/whatsapp'

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  const body = await readBody(event)
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })

  const idem = String(body?.idempotencyKey || crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex'))
  const payload = { ...body }
  delete payload.idempotencyKey

  return await whatsappApi.sendMessage(String(clientId), payload, idem)
})
