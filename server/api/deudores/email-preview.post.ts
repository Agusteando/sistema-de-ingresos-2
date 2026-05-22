import { runWithBridgeAgentId, query } from '../../utils/db'
import { getDeudoresGlobal } from '../../utils/deudores'
import { normalizeTemplateInput, renderCobranzaEmail } from '../../utils/cobranzaEmail'

const normalizeItems = (body: any) => {
  if (Array.isArray(body?.items)) {
    return body.items.map((item: any) => ({
      matricula: String(item?.matricula || '').trim(),
      mes: Number(item?.mes || body?.mes || 0)
    }))
  }

  return [{
    matricula: String(body?.matricula || '').trim(),
    mes: Number(body?.mes || 0)
  }]
}

const getScopedPlantel = (user: any) => {
  return !user?.isSuperAdmin || (user?.isSuperAdmin && user?.active_plantel !== 'GLOBAL')
    ? user?.active_plantel
    : undefined
}

const getDeudorContext = async (matricula: string, ciclo: string, mes: number, user: any) => {
  const rows = await getDeudoresGlobal({
    ciclo,
    plantel: getScopedPlantel(user),
    userEmail: user?.email,
    matricula
  })

  return rows.find(row => row.matricula === matricula && Number(row.mes) === mes)
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const user = event.context.user
  const ciclo = String(body?.ciclo || '').trim()
  const items = normalizeItems(body)

  if (!ciclo || !items.length) {
    throw createError({ statusCode: 400, statusMessage: 'Ciclo e items son requeridos para previsualizar el correo.' })
  }

  const [savedTemplate] = await query<any[]>(`SELECT subject, html_template, include_desglose FROM cobranza_email_templates WHERE code = 'deudores_recordatorio' LIMIT 1`)
  const saved = normalizeTemplateInput(savedTemplate)
  const template = normalizeTemplateInput({
    subject: body?.subject || saved.subject,
    htmlTemplate: body?.htmlTemplate || body?.html_template || saved.htmlTemplate,
    includeDesglose: body?.includeDesglose ?? body?.include_desglose ?? saved.includeDesglose
  })

  const previews = []

  for (const item of items) {
    try {
      const [student] = await query<any[]>(
        `SELECT nombreCompleto, correo, telefono, nivel, grado, grupo, plantel, \`Nombre del padre o tutor\` AS padre FROM base WHERE matricula = ? LIMIT 1`,
        [item.matricula]
      )
      if (!student) throw new Error('Alumno no encontrado.')
      if (!student.correo) throw new Error('El alumno no tiene correo registrado.')

      const deudor = await getDeudorContext(item.matricula, ciclo, item.mes, user)
      const rendered = renderCobranzaEmail({
        student,
        deudor,
        matricula: item.matricula,
        ciclo,
        mes: item.mes,
        subject: template.subject,
        htmlTemplate: template.htmlTemplate,
        includeDesglose: template.includeDesglose
      })

      previews.push({
        matricula: item.matricula,
        mes: item.mes,
        success: true,
        to: student.correo,
        alumno: student.nombreCompleto || deudor?.nombreCompleto || item.matricula,
        subject: rendered.subject,
        html: rendered.html,
        saldo: Number(deudor?.saldoPendiente || deudor?.saldoColegiatura || 0),
        conceptos: rendered.desglose.length
      })
    } catch (error: any) {
      previews.push({
        matricula: item.matricula,
        mes: item.mes,
        success: false,
        message: error?.statusMessage || error?.message || 'No se pudo generar la previsualización.'
      })
    }
  }

  return {
    success: previews.every(item => item.success),
    total: previews.length,
    available: previews.filter(item => item.success).length,
    failed: previews.filter(item => !item.success).length,
    template,
    previews
  }
}))
