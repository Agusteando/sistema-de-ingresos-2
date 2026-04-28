import crypto from 'node:crypto'
import { query } from '../../utils/db'
import { sendEmail } from '../../utils/mailer'
import { whatsappApi } from '../../utils/whatsapp'
import { getDeudoresGlobal } from '../../utils/deudores'

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
  return user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')
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

const escapeHtml = (value: unknown) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const buildHtmlBreakdown = (deudor: any) => {
  return (deudor?.desglose || [])
    .filter((item: any) => Number(item.saldo || 0) > 0)
    .map((item: any) => `${escapeHtml(item.conceptoNombre)} (${escapeHtml(item.mesLabel || item.mesCargo)}): $${Number(item.saldo || 0).toFixed(2)}`)
    .join('<br>')
}

const buildPlainBreakdown = (deudor: any) => {
  return (deudor?.desglose || [])
    .filter((item: any) => Number(item.saldo || 0) > 0)
    .map((item: any) => ({
      concepto: String(item.conceptoNombre || 'Concepto'),
      periodo: String(item.mesLabel || item.mesCargo || ''),
      saldo: Number(item.saldo || 0)
    }))
}

const processAction = async ({
  matricula,
  ciclo,
  mes,
  accion,
  user
}: {
  matricula: string,
  ciclo: string,
  mes: number,
  accion: string,
  user: any
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

  const deudor = await getDeudorContext(matricula, ciclo, mes, user)
  const saldo = Number(deudor?.saldoPendiente || deudor?.saldoColegiatura || 0)
  const desglose = buildPlainBreakdown(deudor)

  if (accion === 'correo_recordatorio') {
    const [student] = await query<any[]>(`SELECT nombreCompleto, correo, \`Nombre del padre o tutor\` AS padre FROM base WHERE matricula = ? LIMIT 1`, [matricula])
    if (!student?.correo) throw createError({ statusCode: 400, statusMessage: 'El alumno no tiene correo registrado.' })

    const desgloseHtml = buildHtmlBreakdown(deudor)
    const [tpl] = await query<any[]>(`SELECT subject, html_template FROM cobranza_email_templates WHERE code = 'deudores_recordatorio' LIMIT 1`)
    const html = String(tpl?.html_template || '')
      .replace(/{{nombre_alumno}}/g, escapeHtml(student.nombreCompleto || ''))
      .replace(/{{tutor}}/g, escapeHtml(student.padre || 'Padre, madre o tutor'))
      .replace(/{{matricula}}/g, escapeHtml(matricula))
      .replace(/{{mes}}/g, escapeHtml(String(mes)))
      .replace(/{{ciclo}}/g, escapeHtml(ciclo))
      .replace(/{{deuda}}/g, saldo.toFixed(2))
      .replace(/{{desglose}}/g, desgloseHtml || 'Estado de cuenta pendiente de regularizar')

    await sendEmail(student.correo, tpl?.subject || 'Recordatorio de pago - Estado de cuenta', html, user?.email)
  }

  if (accion === 'whatsapp_contacto') {
    const [client] = await query<any[]>(`SELECT client_id, status FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1`, [user.email])
    if (!client?.client_id) {
      throw createError({ statusCode: 400, statusMessage: 'Usuario sin cliente de WhatsApp vinculado.' })
    }

    const [student] = await query<any[]>(`SELECT telefono, nombreCompleto FROM base WHERE matricula = ? LIMIT 1`, [matricula])
    const phone = String(student?.telefono || '').replace(/\D+/g, '')
    if (!phone) throw createError({ statusCode: 400, statusMessage: 'No hay teléfono válido para WhatsApp.' })

    const chatId = `${phone.startsWith('52') ? phone : `52${phone}`}@c.us`
    const idem = crypto.createHash('sha256').update(`${client.client_id}:${matricula}:${ciclo}:${mes}:${accion}`).digest('hex')

    await whatsappApi.sendMessage(client.client_id, {
      chatId: [chatId],
      message: `Hola, le recordamos que ${student?.nombreCompleto || matricula} presenta un saldo pendiente por $${saldo.toFixed(2)} MXN correspondiente al periodo ${mes}/${ciclo}. Favor de revisar su estado de cuenta con Administración.`
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
        desglose
      })
    ]
  )

  return { matricula, mes, success: true, duplicated: false, saldo, desglose }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user

  const ciclo = String(body?.ciclo || '').trim()
  const accion = String(body?.accion || '').trim()
  const isBatch = Array.isArray(body?.items)
  const items = normalizeItems(body)

  if (!ciclo || !ACTIONS.has(accion) || !items.length) {
    throw createError({ statusCode: 400, statusMessage: 'Parámetros inválidos para registrar acción de cobranza.' })
  }

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
        user
      })
      results.push(result)
      if (result.duplicated) duplicated++
      else completed++
    } catch (error: any) {
      failed++
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
})