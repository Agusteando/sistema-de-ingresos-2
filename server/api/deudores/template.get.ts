import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeTemplateInput } from '../../utils/cobranzaEmail'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const [template] = await query<any[]>(
    `SELECT code, subject, html_template, include_desglose, updated_at, updated_by FROM cobranza_email_templates WHERE code = 'deudores_recordatorio' LIMIT 1`
  )
  const normalized = normalizeTemplateInput(template)

  return {
    code: template?.code || 'deudores_recordatorio',
    subject: normalized.subject,
    html_template: normalized.htmlTemplate,
    htmlTemplate: normalized.htmlTemplate,
    include_desglose: normalized.includeDesglose ? 1 : 0,
    includeDesglose: normalized.includeDesglose,
    updated_at: template?.updated_at || null,
    updated_by: template?.updated_by || null
  }
}))
