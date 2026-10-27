import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeTemplateInput } from '../../utils/cobranzaEmail'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const user = event.context.user
  const template = normalizeTemplateInput(body)

  if (!template.subject.trim() || !template.htmlTemplate.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Asunto y plantilla HTML son requeridos.' })
  }

  await query(
    `INSERT INTO cobranza_email_templates (code, subject, html_template, include_desglose, updated_at, updated_by)
      VALUES ('deudores_recordatorio', ?, ?, ?, NOW(), ?)
      AS mysql97_new ON DUPLICATE KEY UPDATE subject = mysql97_new.subject, html_template = mysql97_new.html_template, include_desglose = mysql97_new.include_desglose, updated_at = NOW(), updated_by = mysql97_new.updated_by`,
    [template.subject, template.htmlTemplate, template.includeDesglose ? 1 : 0, user.email || user.name || 'sistema']
  )

  return { success: true, ...template }
}))
