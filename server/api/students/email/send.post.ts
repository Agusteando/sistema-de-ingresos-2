import { randomUUID } from 'node:crypto'
import { sendEmailFromUser } from '../../../utils/mailer'
import { isCasitaWorkspaceEmail } from '../../../utils/google-workspace-directory'
import { resolveStudentEmailAudience } from '../../../utils/studentEmail'

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

const renderHtml = (message: string) => {
  const paragraphs = String(message || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `
    <div style="font-family:Arial,sans-serif;color:#17253a;line-height:1.55;max-width:720px;margin:0 auto">
      ${paragraphs || '<p style="margin:0">&nbsp;</p>'}
      <p style="margin:22px 0 0;font-size:11px;color:#7a8798">Mensaje enviado desde Control Escolar.</p>
    </div>
  `
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const body = await readBody(event)
  const senderEmail = normalizeEmail(body?.senderEmail)
  const targetEmail = normalizeEmail(body?.targetEmail)
  const config = useRuntimeConfig()
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey) {
    throw createError({ statusCode: 503, statusMessage: 'El service account de Gmail no está configurado.' })
  }
  const subject = String(body?.subject || '').replace(/[\r\n]+/g, ' ').trim()
  const message = String(body?.message || '').trim()

  if (!senderEmail || !isCasitaWorkspaceEmail(senderEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'Selecciona un remitente válido de Google Workspace.' })
  }
  if (!subject) throw createError({ statusCode: 400, statusMessage: 'Agrega el asunto del correo.' })
  if (subject.length > 180) throw createError({ statusCode: 400, statusMessage: 'El asunto supera 180 caracteres.' })
  if (!message) throw createError({ statusCode: 400, statusMessage: 'Agrega el contenido del correo.' })
  if (message.length > 30000) throw createError({ statusCode: 400, statusMessage: 'El contenido del correo es demasiado largo.' })

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

  const html = renderHtml(message)
  const sent: any[] = []
  const failures: any[] = []

  for (const group of targetGroups) {
    try {
      await sendEmailFromUser(group.email, subject, html, senderEmail, [], message)
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
    requestId: String(body?.requestId || randomUUID()),
    sentEmails: sent.length,
    failedEmails: failures.length,
    sent,
    failures,
    summary: audience.summary,
  }
})
