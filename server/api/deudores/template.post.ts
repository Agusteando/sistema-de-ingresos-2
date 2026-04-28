import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { subject, htmlTemplate } = await readBody(event)
  const user = event.context.user

  if (!subject || !htmlTemplate) {
    throw createError({ statusCode: 400, statusMessage: 'subject y htmlTemplate son requeridos.' })
  }

  await query(
    `INSERT INTO cobranza_email_templates (code, subject, html_template, updated_at, updated_by)
      VALUES ('deudores_recordatorio', ?, ?, NOW(), ?)
      ON DUPLICATE KEY UPDATE subject = VALUES(subject), html_template = VALUES(html_template), updated_at = NOW(), updated_by = VALUES(updated_by)`,
    [String(subject), String(htmlTemplate), user.email || user.name || 'sistema']
  )

  return { success: true }
})
