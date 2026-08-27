import { randomUUID } from 'node:crypto'
import { sendEmailFromUser, type MailAttachment } from '../../../utils/mailer'
import { isCasitaWorkspaceEmail } from '../../../utils/google-workspace-directory'
import { resolveStudentEmailAudience } from '../../../utils/studentEmail'
import {
  COMMUNICATION_ATTACHMENT_MAX_BYTES,
  isCommunicationAttachmentImage,
  isSupportedCommunicationAttachment,
  resolveCommunicationAttachmentContentType,
} from '../../../../utils/communicationAttachments'

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const multipartField = (parts: any[], name: string) => parts.find((part) => part.name === name)
const multipartText = (parts: any[], name: string) => multipartField(parts, name)?.data?.toString('utf8') || ''

const renderHtml = (message: string, inlineImageCid = '') => {
  const paragraphs = String(message || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')

  const inlineImage = inlineImageCid
    ? `<div style="margin:18px 0 0"><img src="cid:${escapeHtml(inlineImageCid)}" alt="Imagen del mensaje" style="display:block;width:100%;max-width:680px;height:auto;border:0;border-radius:10px"></div>`
    : ''

  return `
    <div style="font-family:Arial,sans-serif;color:#17253a;line-height:1.55;max-width:720px;margin:0 auto">
      ${paragraphs || '<p style="margin:0">&nbsp;</p>'}
      ${inlineImage}
      <p style="margin:22px 0 0;font-size:11px;color:#7a8798">Mensaje enviado desde Control Escolar.</p>
    </div>
  `
}

const parseRequest = async (event: any) => {
  const contentType = String(getRequestHeader(event, 'content-type') || '').toLowerCase()
  if (!contentType.includes('multipart/form-data')) {
    return { body: await readBody(event), attachment: null as any }
  }

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'Solicitud inválida.' })

  let matriculas: unknown = []
  let students: unknown = []
  try {
    matriculas = JSON.parse(multipartText(parts, 'matriculas') || '[]')
    students = JSON.parse(multipartText(parts, 'students') || '[]')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'La selección de alumnos no es válida.' })
  }

  return {
    body: {
      matriculas,
      students,
      senderEmail: multipartText(parts, 'senderEmail'),
      senderName: multipartText(parts, 'senderName'),
      targetEmail: multipartText(parts, 'targetEmail'),
      subject: multipartText(parts, 'subject'),
      message: multipartText(parts, 'message'),
      requestId: multipartText(parts, 'requestId'),
    },
    attachment: multipartField(parts, 'attachment') || multipartField(parts, 'image') || null,
  }
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const { body, attachment } = await parseRequest(event)
  const senderEmail = normalizeEmail(body?.senderEmail)
  const targetEmail = normalizeEmail(body?.targetEmail)
  const senderName = String(body?.senderName || '').replace(/[\r\n]+/g, ' ').trim()
  const config = useRuntimeConfig()
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey) {
    throw createError({ statusCode: 503, statusMessage: 'El service account de Gmail no está configurado.' })
  }
  const subject = String(body?.subject || '').replace(/[\r\n]+/g, ' ').trim()
  const message = String(body?.message || '').trim()

  if (!senderEmail || !isCasitaWorkspaceEmail(senderEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'Selecciona un remitente válido de Google Workspace.' })
  }
  if (!senderName || senderName.toLowerCase() === senderEmail.toLowerCase()) {
    throw createError({ statusCode: 400, statusMessage: 'No se pudo resolver el nombre completo del remitente de Workspace.' })
  }
  if (!subject) throw createError({ statusCode: 400, statusMessage: 'Agrega el asunto del correo.' })
  if (subject.length > 180) throw createError({ statusCode: 400, statusMessage: 'El asunto supera 180 caracteres.' })
  if (!message) throw createError({ statusCode: 400, statusMessage: 'Agrega el contenido del correo.' })
  if (message.length > 30000) throw createError({ statusCode: 400, statusMessage: 'El contenido del correo es demasiado largo.' })

  if (attachment) {
    if (!isSupportedCommunicationAttachment({ filename: attachment.filename, type: attachment.type })) {
      throw createError({ statusCode: 400, statusMessage: 'El archivo adjunto debe ser una imagen, PDF o documento compatible.' })
    }
    if (!attachment.data?.length) {
      throw createError({ statusCode: 400, statusMessage: 'El archivo adjunto está vacío.' })
    }
    if (Number(attachment.data.length) > COMMUNICATION_ATTACHMENT_MAX_BYTES) {
      throw createError({ statusCode: 400, statusMessage: 'El archivo adjunto supera 10 MB.' })
    }
  }

  const audience = await resolveStudentEmailAudience(body?.matriculas, user, {
    contactSource: 'selection',
    students: body?.students,
  })
  if (!audience.groups.length) {
    throw createError({ statusCode: 400, statusMessage: 'La selección no tiene correos familiares disponibles.' })
  }

  const targetGroups = targetEmail
    ? audience.groups.filter((group) => group.email === targetEmail)
    : audience.groups
  if (targetEmail && !targetGroups.length) {
    throw createError({ statusCode: 400, statusMessage: 'El correo destino ya no pertenece a la selección.' })
  }

  const attachmentIsImage = Boolean(attachment?.data?.length) && isCommunicationAttachmentImage({
    filename: attachment?.filename,
    type: attachment?.type,
  })
  const inlineImageCid = attachmentIsImage ? `control-escolar-${randomUUID()}@aurora` : ''
  const mailAttachments: MailAttachment[] = attachment?.data?.length
    ? [{
        filename: String(attachment.filename || (attachmentIsImage ? 'imagen-mensaje' : 'documento-adjunto')).trim() || (attachmentIsImage ? 'imagen-mensaje' : 'documento-adjunto'),
        content: attachment.data,
        contentType: resolveCommunicationAttachmentContentType({ filename: attachment.filename, type: attachment.type }),
        disposition: attachmentIsImage ? 'inline' : 'attachment',
        ...(attachmentIsImage ? { contentId: inlineImageCid } : {}),
      }]
    : []

  const html = renderHtml(message, inlineImageCid)
  const sent: any[] = []
  const failures: any[] = []

  for (const group of targetGroups) {
    try {
      await sendEmailFromUser(group.email, subject, html, senderEmail, mailAttachments, message, senderName)
      sent.push({
        email: group.email,
        matriculas: group.matriculas,
        names: group.names,
      })
    } catch (error: any) {
      failures.push({
        email: group.email,
        matriculas: group.matriculas,
        names: group.names,
        message: String(error?.message || error?.statusMessage || 'Gmail rechazó el envío.'),
      })
    }
  }

  return {
    success: sent.length > 0 && failures.length === 0,
    partial: sent.length > 0 && failures.length > 0,
    senderEmail,
    senderName,
    requestId: String(body?.requestId || randomUUID()),
    sentEmails: sent.length,
    failedEmails: failures.length,
    attachment: mailAttachments.length
      ? {
          filename: mailAttachments[0].filename,
          contentType: mailAttachments[0].contentType,
          bytes: Number(attachment.data.length),
          disposition: attachmentIsImage ? 'inline' : 'attachment',
        }
      : null,
    inlineImage: attachmentIsImage && mailAttachments.length
      ? { filename: mailAttachments[0].filename, contentType: mailAttachments[0].contentType, bytes: Number(attachment.data.length) }
      : null,
    sent,
    failures,
    summary: audience.summary,
  }
})
