import crypto from 'node:crypto'
import { runWithBridgeAgentId, query } from '../../utils/db'
import { sendEmail } from '../../utils/mailer'
import { whatsappApi } from '../../utils/whatsapp'
import { getDeudoresGlobal } from '../../utils/deudores'
import { normalizeTemplateInput, renderCobranzaEmail } from '../../utils/cobranzaEmail'

const ACTIONS = new Set(['correo_recordatorio', 'whatsapp_contacto', 'carta_suspension', 'llamada_telefonica', 'reporte_deudores'])

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

const deudorKey = (matricula: string, mes: number) => `${matricula}:${Number(mes)}`

const getDeudorContext = async (matricula: string, ciclo: string, mes: number, user: any) => {
  const rows = await getDeudoresGlobal({
    ciclo,
    plantel: getScopedPlantel(user),
    userEmail: user?.email,
    matricula
  })

  return rows.find(row => row.matricula === matricula && Number(row.mes) === mes)
}

const buildPlainBreakdown = (deudor: any) => {
  return (deudor?.desglose || [])
    .filter((item: any) => Number(item.saldo || 0) > 0)
    .map((item: any) => ({
      concepto: String(item.conceptoNombre || 'Concepto'),
      periodo: String(item.mesLabel || item.mesCargo || ''),
      saldo: Number(item.saldo || 0),
      recargo: Number(item.recargoMonto || 0),
      recargoPorcentaje: Number(item.recargoPorcentaje || 0)
    }))
}

type EmailOptions = {
  subject?: string
  htmlTemplate?: string
  includeDesglose?: boolean
}

const getCobranzaTemplate = async (emailOptions?: EmailOptions | null) => {
  const [tpl] = await query<any[]>(`SELECT subject, html_template, include_desglose FROM cobranza_email_templates WHERE code = 'deudores_recordatorio' LIMIT 1`)
  const saved = normalizeTemplateInput(tpl)
  return normalizeTemplateInput({
    subject: emailOptions?.subject || saved.subject,
    htmlTemplate: emailOptions?.htmlTemplate || saved.htmlTemplate,
    includeDesglose: emailOptions?.includeDesglose ?? saved.includeDesglose
  })
}

const processAction = async ({
  matricula,
  ciclo,
  mes,
  accion,
  user,
  emailOptions,
  deudorContext,
  emailTemplate
}: {
  matricula: string,
  ciclo: string,
  mes: number,
  accion: string,
  user: any,
  emailOptions?: EmailOptions | null,
  deudorContext?: any,
  emailTemplate?: Awaited<ReturnType<typeof getCobranzaTemplate>>
}) => {
  if (!matricula || !mes) {
    throw createError({ statusCode: 400, statusMessage: 'Alumno o periodo inválido.' })
  }

  const existing = await query<any[]>(
    `SELECT id FROM cobranza_eventos WHERE matricula = ? AND ciclo = ? AND mes = ? AND accion = ? LIMIT 1`,
    [matricula, ciclo, mes, accion]
  )

  if (existing.length) {
    return { matricula, mes, success: true, duplicated: true, message: 'Acción ya registrada para este alumno y periodo.' }
  }

  const deudor = deudorContext !== undefined ? deudorContext : await getDeudorContext(matricula, ciclo, mes, user)
  if (!deudor?.isDeudor) {
    throw createError({
      statusCode: 409,
      statusMessage: 'El alumno ya no tiene adeudo exigible para este periodo.'
    })
  }
  const saldo = Number(deudor?.saldoPendiente || deudor?.saldoColegiatura || 0)
  const totalRecargos = Number(deudor?.totalRecargos || 0)
  const desglose = buildPlainBreakdown(deudor)
  let emailMetadata: Record<string, any> | null = null

  if (accion === 'correo_recordatorio') {
    const contactStudent = deudor
    if (!contactStudent?.correo) throw createError({ statusCode: 400, statusMessage: 'El alumno no tiene correo registrado.' })

    const template = emailTemplate || await getCobranzaTemplate(emailOptions)
    const rendered = renderCobranzaEmail({
      student: contactStudent,
      deudor,
      matricula,
      ciclo,
      mes,
      subject: template.subject,
      htmlTemplate: template.htmlTemplate,
      includeDesglose: template.includeDesglose
    })

    const delivery = await sendEmail(contactStudent.correo, rendered.subject, rendered.html, user?.email)
    // A successful Gmail API response is evidence of acceptance even when
    // the subsequent audit insert cannot be confirmed by the DB Bridge.
    console.info('[CobranzaEmail]', { stage: 'gmail_accepted', messageId: delivery.messageId || '' })
    emailMetadata = {
      destinatario: contactStudent.correo,
      messageId: delivery.messageId,
      sender: delivery.sender,
      subject: rendered.subject,
      includeDesglose: template.includeDesglose,
      conceptosEnviados: rendered.desglose.length
    }
  }

  if (accion === 'whatsapp_contacto') {
    const [client] = await query<any[]>(`SELECT client_id, status FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1`, [user.email])
    if (!client?.client_id) {
      throw createError({ statusCode: 400, statusMessage: 'Usuario sin cliente de WhatsApp vinculado.' })
    }

    const [student] = await query<any[]>(`SELECT telefono, nombreCompleto FROM base WHERE matricula = ? LIMIT 1`, [matricula])
    const contactStudent = { ...(student || {}), ...(deudor || {}) }
    const phone = String(contactStudent?.telefono || '').replace(/\D+/g, '')
    if (!phone) throw createError({ statusCode: 400, statusMessage: 'No hay teléfono válido para WhatsApp.' })

    const chatId = `${phone.startsWith('52') ? phone : `52${phone}`}@c.us`
    const idem = crypto.createHash('sha256').update(`${client.client_id}:${matricula}:${ciclo}:${mes}:${accion}`).digest('hex')

    await whatsappApi.sendMessage(client.client_id, {
      chatId: [chatId],
      message: `Hola, le recordamos que ${contactStudent?.nombreCompleto || matricula} presenta un saldo pendiente por ${saldo.toFixed(2)} MXN${totalRecargos > 0 ? ` (incluye ${totalRecargos.toFixed(2)} MXN de recargos)` : ''} correspondiente al periodo ${mes}/${ciclo}. Favor de revisar su estado de cuenta con Administración.`
    }, idem)
  }

  await query(
    `INSERT INTO cobranza_eventos (matricula, ciclo, mes, accion, fecha, usuario, metadata)
     VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
    [
      matricula,
      ciclo,
      mes,
      accion,
      user.email || user.name || 'sistema',
      JSON.stringify({
        origen: 'manual',
        iniciadoPorHumano: true,
        saldo,
        totalRecargos,
        desglose,
        email: emailMetadata
      })
    ]
  )

  return { matricula, mes, success: true, duplicated: false, saldo, totalRecargos, desglose, ...(emailMetadata ? { messageId: emailMetadata.messageId } : {}) }
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const user = event.context.user

  const ciclo = String(body?.ciclo || '').trim()
  const accion = String(body?.accion || '').trim()
  const isBatch = Array.isArray(body?.items)
  const items = normalizeItems(body)
  const emailOptions = body?.emailOptions || null

  if (!ciclo || !ACTIONS.has(accion) || !items.length) {
    throw createError({ statusCode: 400, statusMessage: 'Parámetros inválidos para registrar acción de cobranza.' })
  }

  // One fresh source-of-truth query per selected group, not one per recipient.
  const matriculas = [...new Set(items.map(item => item.matricula).filter(Boolean))]
  const emailDeudores = accion === 'correo_recordatorio' && matriculas.length
    ? await getDeudoresGlobal({
        ciclo,
        plantel: getScopedPlantel(user),
        userEmail: user?.email,
        matriculas
      })
    : []
  const byKey = new Map<string, any>(emailDeudores.map(row => [deudorKey(row.matricula, Number(row.mes)), row]))
  const emailTemplate = accion === 'correo_recordatorio' ? await getCobranzaTemplate(emailOptions) : undefined

  const results = []
  let completed = 0
  let duplicated = 0
  let failed = 0

  for (const item of items) {
    try {
      const result = await processAction({
        matricula: item.matricula,
        ciclo,
        mes: item.mes,
        accion,
        user,
        emailOptions,
        deudorContext: accion === 'correo_recordatorio' ? (byKey.get(deudorKey(item.matricula, item.mes)) || null) : undefined,
        emailTemplate
      })
      results.push(result)
      if (result.duplicated) duplicated++
      else completed++
      if (accion === 'correo_recordatorio' && !result.duplicated) {
        console.info('[CobranzaEmail]', {
          stage: 'accepted_and_recorded',
          requestId: event.context.auroraRequestId || '',
          agentId: event.context.dbBridgeAgentId || '',
          messageId: result.messageId || ''
        })
      }
    } catch (error: any) {
      failed++
      if (accion === 'correo_recordatorio') {
        console.warn('[CobranzaEmail]', {
          stage: 'send_or_record_failed',
          requestId: event.context.auroraRequestId || '',
          agentId: event.context.dbBridgeAgentId || '',
          code: error?.code || error?.data?.diagnostic?.code || 'UNKNOWN',
          message: String(error?.message || '').slice(0, 220)
        })
      }
      results.push({
        matricula: item.matricula,
        mes: item.mes,
        success: false,
        message: error?.statusMessage || error?.message || 'No se pudo registrar la acción.'
      })
    }
  }

  if (!isBatch && failed > 0) {
    throw createError({ statusCode: 400, statusMessage: results[0]?.message || 'No se pudo registrar la acción.' })
  }

  return {
    success: failed === 0,
    accion,
    total: items.length,
    completed,
    duplicated,
    failed,
    results
  }
}))
