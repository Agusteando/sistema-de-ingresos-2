import { fetchControlEscolarStudentDetail, resolveControlEscolarAuth, runControlEscolar } from '../../../../utils/control-escolar'
import { sendEmail } from '../../../../utils/mailer'

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const firstEmail = (...values: unknown[]) => values
  .map((value) => String(value || '').trim().toLowerCase())
  .find((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || ''

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const matricula = String(event.context.params?.id || '').trim()
  const body = await readBody(event).catch(() => ({}))

  return await runControlEscolar(event, auth.agentId, async () => {
    const student = await fetchControlEscolarStudentDetail(auth.agentId, matricula)
    if (!student.huskyPassAvailable) {
      throw createError({ statusCode: 404, message: 'Este alumno no tiene Husky Pass activo.' })
    }

    const to = firstEmail(body?.to, student.emailPadre, student.emailMadre, student.email, student.huskyPassEmail)
    if (!to) {
      throw createError({ statusCode: 400, message: 'El alumno no tiene correo de padre/tutor para enviar Husky Pass.' })
    }

    const subject = `Accesos Husky Pass - ${student.fullName || student.matricula}`
    const html = `
      <div style="font-family:Arial,sans-serif;color:#15233c;line-height:1.45">
        <h2 style="margin:0 0 12px;color:#20882d">Husky Pass accesos</h2>
        <p>Compartimos los accesos del alumno <strong>${escapeHtml(student.fullName || student.matricula)}</strong>.</p>
        <div style="border:1px solid #dfe7ef;border-radius:14px;padding:16px;background:#f8fcf6;margin:16px 0">
          <p style="margin:0 0 8px"><strong>Usuario:</strong> ${escapeHtml(student.huskyPassUsername)}</p>
          <p style="margin:0"><strong>Contraseña:</strong> ${escapeHtml(student.huskyPassPlaintext)}</p>
        </div>
        <p style="font-size:12px;color:#68758d">Mensaje enviado desde Control Escolar. Si requiere apoyo, contacte al plantel.</p>
      </div>
    `

    await sendEmail(to, subject, html, auth.user.email)
    return { success: true, sentTo: to }
  })
})
