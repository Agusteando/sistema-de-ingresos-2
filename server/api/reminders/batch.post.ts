import { sendEmail } from '../../utils/mailer'

export default defineEventHandler(async (event) => {
  const { template, asunto, destinatarios } = await readBody(event)
  const user = event.context.user

  if (!user || !['global', 'plantel'].includes(user.role)) {
    throw createError({ statusCode: 403, message: 'Operación denegada' })
  }

  if (!destinatarios || !destinatarios.length) {
    return { success: false, message: 'No hay destinatarios válidos' }
  }

  const results = { sent: 0, failed: 0 }

  for (const dest of destinatarios) {
    if (!dest.correo || !dest.correo.includes('@')) {
      results.failed++
      continue
    }

    // Process variables in the template
    let finalHtml = template
      .replace(/{{nombre_alumno}}/g, dest.nombreCompleto)
      .replace(/{{tutor}}/g, dest.padre || 'Padre, Madre o Tutor')
      .replace(/{{deuda}}/g, Number(dest.deudaVigente).toFixed(2))
      .replace(/{{matricula}}/g, dest.matricula)

    const fullHtml = `
      <div style="font-family: 'Inter', sans-serif; color: #232C25; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #E5E7EB; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid #4E844E; padding-bottom: 20px;">
          <h2 style="color: #4E844E; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">Aviso Institucional - Estado de Cuenta</h2>
        </div>
        <div style="line-height: 1.6; font-size: 15px;">
          ${finalHtml}
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #6B7280; font-size: 12px;">
          <p style="margin: 0;">Atentamente,<br/><strong style="color: #374151;">Departamento Administrativo y de Cobranza</strong><br/>IECS - IEDIS</p>
        </div>
      </div>
    `

    try {
      await sendEmail(dest.correo, asunto, fullHtml)
      results.sent++
    } catch (error) {
      console.error(`Failed to send batch email to ${dest.correo}:`, error)
      results.failed++
    }
  }

  return { success: true, results }
})