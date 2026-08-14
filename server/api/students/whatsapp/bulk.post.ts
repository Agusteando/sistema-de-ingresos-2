import crypto from 'node:crypto'
import { runWithBridgeAgentId, query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'
import { resolveStudentWhatsappAudience } from '../../../utils/studentWhatsapp'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const multipartField = (parts: any[], name: string) => parts.find(part => part.name === name)
const multipartText = (parts: any[], name: string) => multipartField(parts, name)?.data?.toString('utf8') || ''
const extractStatus = (payload: any) => payload?.instance?.status || payload?.status?.status || payload?.status || 'pending'

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

  const [client] = await query<any[]>(
    `SELECT client_id, status FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1`,
    [user.email]
  )
  if (!client?.client_id) {
    throw createError({ statusCode: 400, statusMessage: 'Vincula WhatsApp antes de enviar.' })
  }

  const statusPayload = await whatsappApi.getStatus(String(client.client_id))
  const sessionStatus = String(extractStatus(statusPayload))
  await query(`UPDATE cobranza_whatsapp_clients SET status = ?, updated_at = NOW() WHERE client_id = ?`, [sessionStatus, client.client_id])
  if (sessionStatus.toLowerCase() !== 'ready') {
    throw createError({ statusCode: 409, statusMessage: 'La sesión de WhatsApp no está conectada.' })
  }

  const requestId = multipartText(parts, 'requestId') || crypto.randomUUID()
  const idempotencyKey = crypto.createHash('sha256')
    .update(`${client.client_id}:${user.email}:${requestId}:${audience.chatIds.join('|')}`)
    .digest('hex')

  const response = image?.data?.length
    ? await whatsappApi.sendMedia(String(client.client_id), {
        chatIds: audience.chatIds,
        caption: message,
        file: image.data,
        filename: image.filename || 'imagen',
        mimetype: image.type || 'image/jpeg'
      }, idempotencyKey)
    : await whatsappApi.sendMessage(String(client.client_id), {
        chatId: audience.chatIds,
        message
      }, idempotencyKey)

  const sentChatIds = new Set((response?.messages || []).map((item: any) => String(item?.chatId || '')))
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
    sentChats: sentChatIds.size,
    failedChats: failures.length,
    failures,
    summary: audience.summary,
    skipped: audience.summary.missingPhone + audience.summary.notFound,
    deduplicated: audience.summary.deduplicated
  }
}))
