import crypto from 'node:crypto'
import { query } from '../../utils/db'
import { sendEmail } from '../../utils/mailer'
import { whatsappApi } from '../../utils/whatsapp'

const ACTIONS = new Set(['correo_recordatorio', 'whatsapp_contacto', 'carta_suspension', 'llamada_telefonica', 'reporte_deudores'])

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user

  const matricula = String(body?.matricula || '').trim()
  const ciclo = String(body?.ciclo || '').trim()
  const mes = Number(body?.mes || 0)
  const accion = String(body?.accion || '').trim()

  if (!matricula || !ciclo || !mes || !ACTIONS.has(accion)) {
    throw createError({ statusCode: 400, statusMessage: 'Parámetros inválidos para registrar acción de cobranza.' })
  }

  const existing = await query<any[]>(
    `SELECT id FROM cobranza_eventos WHERE matricula = ? AND ciclo = ? AND mes = ? AND accion = ? LIMIT 1`,
    [matricula, ciclo, mes, accion]
  )

  if (existing.length) {
    return { success: true, duplicated: true, message: 'Acción ya registrada para este alumno y periodo.' }
  }

  if (accion === 'correo_recordatorio') {
    const [student] = await query<any[]>(`SELECT nombreCompleto, correo, \`Nombre del padre o tutor\` AS padre FROM base WHERE matricula = ? LIMIT 1`, [matricula])
    if (!student?.correo) throw createError({ statusCode: 400, statusMessage: 'El alumno no tiene correo registrado.' })

    const [tpl] = await query<any[]>(`SELECT subject, html_template FROM cobranza_email_templates WHERE code = 'deudores_recordatorio' LIMIT 1`)
    const html = String(tpl?.html_template || '')
      .replace(/{{nombre_alumno}}/g, student.nombreCompleto || '')
      .replace(/{{tutor}}/g, student.padre || 'Padre, Madre o Tutor')
      .replace(/{{matricula}}/g, matricula)
      .replace(/{{mes}}/g, String(mes))
      .replace(/{{ciclo}}/g, ciclo)

    await sendEmail(student.correo, tpl?.subject || 'Recordatorio de pago - Colegiatura', html, user?.email)
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
      message: `Hola, le recordamos la colegiatura pendiente de ${student?.nombreCompleto || matricula} del periodo ${mes}/${ciclo}. Favor de revisar su Estado de Cuenta.`
    }, idem)
  }

  await query(
    `INSERT INTO cobranza_eventos (matricula, ciclo, mes, accion, fecha, usuario, metadata)
     VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
    [matricula, ciclo, mes, accion, user.email || user.name || 'sistema', JSON.stringify({ source: 'manual-or-assisted' })]
  )

  return { success: true, duplicated: false }
})
