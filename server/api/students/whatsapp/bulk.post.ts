import crypto from 'node:crypto'
import { runWithBridgeAgentId, query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'
import { resolveStudentWhatsappAudience } from '../../../utils/studentWhatsapp'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const multipartField = (parts: any[], name: string) => parts.find(part => part.name === name)
const multipartText = (parts: any[], name: string) => multipartField(parts, name)?.data?.toString('utf8') || ''
const extractStatus = (payload: any) => payload?.instance?.status || payload?.status?.status || payload?.status || 'pending'
const isMissingInstanceError = (error: any) => Number(error?.statusCode || error?.status || 0) === 404
  || /does not exist|instance not found|no encontrada|not found/i.test(String(error?.statusMessage || error?.message || ''))

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'Solicitud inválida.' })

  let matriculas: unknown = []
  try {
    matriculas = JSON.parse(multipartText(parts, 'matriculas') || '[]')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Selección inválida.' })
  }

  const transport = multipartText(parts, 'transport').trim().toLowerCase() === 'qr' ? 'qr' : 'public'
  const message = multipartText(parts, 'message').trim()
  const image = multipartField(parts, 'image')

  if (!message && !image?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Agrega un mensaje, una imagen o ambos.' })
  }
  if (message.length > 4096) {
    throw createError({ statusCode: 400, statusMessage: 'El mensaje supera 4096 caracteres.' })
  }
  if (image) {
    if (!String(image.type || '').startsWith('image/')) {
      throw createError({ statusCode: 400, statusMessage: 'El archivo debe ser una imagen.' })
    }
    if (Number(image.data?.length || 0) > MAX_IMAGE_BYTES) {
      throw createError({ statusCode: 400, statusMessage: 'La imagen supera 10 MB.' })
    }
  }

  const audience = await resolveStudentWhatsappAudience(matriculas, user)
  if (!audience.chatIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'La selección no tiene teléfonos disponibles para WhatsApp.' })
  }

  let clientId = 'public'
  if (transport === 'qr') {
    const [client] = await query<any[]>(
      `SELECT client_id, status FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1`,
      [user.email]
    )
    if (!client?.client_id) {
      throw createError({ statusCode: 400, statusMessage: 'Vincula una sesión QR antes de enviar.' })
    }

    clientId = String(client.client_id)
    try {
      const statusPayload = await whatsappApi.getStatus(clientId)
      const sessionStatus = String(extractStatus(statusPayload))
      await query(`UPDATE cobranza_whatsapp_clients SET status = ?, updated_at = NOW() WHERE client_id = ?`, [sessionStatus, clientId])
      if (sessionStatus.toLowerCase() !== 'ready') {
        throw createError({ statusCode: 409, statusMessage: 'La sesión QR no está conectada.' })
      }
    } catch (error) {
      if (isMissingInstanceError(error)) {
        await query(`DELETE FROM cobranza_whatsapp_clients WHERE client_id = ? AND user_email = ?`, [clientId, user.email])
        throw createError({ statusCode: 409, statusMessage: 'La sesión QR expiró. Vuelve a vincularla.' })
      }
      throw error
    }
  }

  const requestId = multipartText(parts, 'requestId') || crypto.randomUUID()
  const idempotencyKey = crypto.createHash('sha256')
    .update(`${transport}:${clientId}:${user.email}:${requestId}:${audience.chatIds.join('|')}`)
    .digest('hex')

  const mediaPayload = image?.data?.length ? {
    chatIds: audience.chatIds,
    caption: message,
    file: image.data,
    filename: image.filename || 'imagen',
    mimetype: image.type || 'image/jpeg'
  } : null

  const response = transport === 'qr'
    ? mediaPayload
      ? await whatsappApi.sendMedia(clientId, mediaPayload, idempotencyKey)
      : await whatsappApi.sendMessage(clientId, { chatId: audience.chatIds, message }, idempotencyKey)
    : mediaPayload
      ? await whatsappApi.sendPublicMedia(mediaPayload, idempotencyKey)
      : await whatsappApi.sendPublicMessage({ chatId: audience.chatIds, message }, idempotencyKey)

  const sentChatIds = new Set((response?.messages || []).map((item: any) => String(item?.chatId || item?.requestedChatId || '')))
  const failureMap = new Map((response?.failures || []).map((item: any) => [String(item?.chatId || ''), String(item?.error || 'No enviado')]))
  const failures = audience.groups
    .filter(group => failureMap.has(group.chatId))
    .map(group => ({
      matriculas: group.matriculas,
      names: group.names,
      message: failureMap.get(group.chatId) || 'No enviado'
    }))

  return {
    success: failures.length === 0 && sentChatIds.size > 0,
    partial: sentChatIds.size > 0 && failures.length > 0,
    transport,
    clientUsed: response?.clientUsed || (transport === 'qr' ? clientId : 'public'),
    sentChats: sentChatIds.size,
    failedChats: failures.length,
    failures,
    summary: audience.summary,
    skipped: audience.summary.missingPhone + audience.summary.notFound,
    deduplicated: audience.summary.deduplicated
  }
}))
