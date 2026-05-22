import { runWithBridgeAgentId, query } from '../../utils/db'
import { sendEmail } from '../../utils/mailer'
import { COBRANZA_TEMPLATE_CODE, renderCobranzaEmail } from '../../utils/cobranza-email'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)

  if (!body?.correo || !String(body.correo).includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Correo destino inválido.' })
  }

  let tpl: any = null
  try {
    const [templateRow] = await query<any[]>(
      `SELECT subject, html_template FROM cobranza_email_templates WHERE code = ? LIMIT 1`,
      [COBRANZA_TEMPLATE_CODE]
    )
    tpl = templateRow || null
  } catch (error: any) {
    console.warn('[Cobranza] No se pudo leer plantilla de correo; se usará el contenido base.', error?.message || error)
  }

  const rendered = renderCobranzaEmail({
    subject: body.asunto || tpl?.subject,
    htmlTemplate: tpl?.html_template,
    context: {
      nombreAlumno: body.nombreAlumno || body.nombre_alumno || '',
      tutor: body.tutor || 'Padre, madre o tutor',
      matricula: body.matricula || '',
      mes: body.mes || '',
      ciclo: body.ciclo || '',
      deuda: body.deuda || 0,
      plantel: body.plantel || '',
      desglose: Array.isArray(body.desglose) ? body.desglose : []
    }
  })

  await sendEmail(body.correo, rendered.subject, rendered.html)
  return { success: true }
}))
