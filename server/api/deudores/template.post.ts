import { runWithBridgeAgentId, query } from '../../utils/db'
import {
  COBRANZA_TEMPLATE_CODE,
  DEFAULT_COBRANZA_EMAIL_SUBJECT,
  DEFAULT_COBRANZA_EMAIL_TEMPLATE
} from '../../utils/cobranza-email'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { subject, htmlTemplate } = await readBody(event)
  const user = event.context.user

  const normalizedSubject = String(subject || '').trim()
  const normalizedHtml = String(htmlTemplate || '').trim()

  if (!normalizedSubject || !normalizedHtml) {
    throw createError({ statusCode: 400, statusMessage: 'El asunto y el contenido del correo son requeridos.' })
  }

  await query(`
    CREATE TABLE IF NOT EXISTS cobranza_email_templates (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(100) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      html_template LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(255) NULL,
      UNIQUE KEY uniq_cobranza_email_template_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)

  await query(
    `INSERT INTO cobranza_email_templates (code, subject, html_template, updated_at, updated_by)
      VALUES (?, ?, ?, NOW(), ?)
      ON DUPLICATE KEY UPDATE subject = VALUES(subject), html_template = VALUES(html_template), updated_at = NOW(), updated_by = VALUES(updated_by)`,
    [COBRANZA_TEMPLATE_CODE, normalizedSubject, normalizedHtml, user.email || user.name || 'sistema']
  )

  return {
    success: true,
    subject: normalizedSubject || DEFAULT_COBRANZA_EMAIL_SUBJECT,
    html_template: normalizedHtml || DEFAULT_COBRANZA_EMAIL_TEMPLATE
  }
}))
