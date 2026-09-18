import { sendEmail } from '../../../../utils/mailer'
import {
  assertAuroraExternalApiToken,
  setExternalApiResponseHeaders,
} from '../../../../utils/external-api-auth'

const TEST_EMAIL = 'desarrollo.tecnologico@casitaiedis.edu.mx'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const marker = `aurora-deudores-production-${Date.now()}`
  const subject = `Aurora /deudores · prueba de entrega · ${marker}`
  const text = [
    'Prueba automática de entrega de correo de /deudores en el runtime de producción de Aurora.',
    `Marcador: ${marker}`,
    'El mensaje fue enviado mediante el mismo mailer utilizado por cobranza.'
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17253a">
      <h2 style="margin:0 0 12px">Aurora · /deudores</h2>
      <p>Prueba automática de entrega desde el runtime de producción.</p>
      <p><strong>Marcador:</strong> ${marker}</p>
      <p>Este mensaje usa el mismo mailer de cobranza.</p>
    </div>
  `.trim()

  const delivery = await sendEmail(TEST_EMAIL, subject, html, undefined, [], text)

  return {
    success: true,
    recipient: TEST_EMAIL,
    sender: delivery.sender,
    messageId: delivery.messageId,
    marker,
  }
})
