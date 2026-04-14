import { sendEmail } from '../../utils/mailer'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  const htmlTemplate = `
    <div style="font-family: sans-serif; color: #232C25; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D0D3C7; border-radius: 8px;">
      <h2 style="color: #4E844E;">Aviso de Saldo Pendiente - IECS IEDIS</h2>
      <p>Estimado(a) Padre, Madre o Tutor,</p>
      <p>${body.mensaje}</p>
      <p>Atentamente,<br/><strong>Administración SISTEMA DE INGRESOS 2</strong></p>
    </div>
  `
  
  await sendEmail(body.correo, body.asunto, htmlTemplate)
  return { success: true }
})