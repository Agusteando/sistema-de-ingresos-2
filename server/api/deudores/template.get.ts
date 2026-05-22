import { runWithBridgeAgentId, query } from '../../utils/db'
import {
  COBRANZA_TEMPLATE_CODE,
  DEFAULT_COBRANZA_EMAIL_SUBJECT,
  DEFAULT_COBRANZA_EMAIL_TEMPLATE
} from '../../utils/cobranza-email'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  let template: any = null
  try {
    const [templateRow] = await query<any[]>(
      `SELECT code, subject, html_template, updated_at, updated_by FROM cobranza_email_templates WHERE code = ? LIMIT 1`,
      [COBRANZA_TEMPLATE_CODE]
    )
    template = templateRow || null
  } catch (error: any) {
    console.warn('[Cobranza] No se pudo leer plantilla de correo; se devolverá la plantilla base.', error?.message || error)
  }

  return {
    code: COBRANZA_TEMPLATE_CODE,
    subject: String(template?.subject || DEFAULT_COBRANZA_EMAIL_SUBJECT).trim() || DEFAULT_COBRANZA_EMAIL_SUBJECT,
    html_template: String(template?.html_template || DEFAULT_COBRANZA_EMAIL_TEMPLATE).trim() || DEFAULT_COBRANZA_EMAIL_TEMPLATE,
    updated_at: template?.updated_at || null,
    updated_by: template?.updated_by || null,
    placeholders: [
      'nombre_alumno',
      'tutor',
      'matricula',
      'mes',
      'ciclo',
      'deuda',
      'deuda_numero',
      'plantel',
      'fecha',
      'desglose',
      'desglose_texto'
    ]
  }
}))
