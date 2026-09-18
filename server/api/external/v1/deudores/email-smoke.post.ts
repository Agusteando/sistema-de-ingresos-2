import { sendEmail } from '../../../../utils/mailer'
import { renderCobranzaEmail } from '../../../../utils/cobranzaEmail'
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
  const rendered = renderCobranzaEmail({
    student: {
      nombreCompleto: 'Prueba Institucional IECS-IEDIS',
      padre: 'Familia de prueba',
      correo: TEST_EMAIL,
      plantel: 'PM',
      grado: '4',
      grupo: 'A',
    },
    deudor: {
      saldoPendiente: 3250,
      fechaLimitePago: '2026-09-20',
      nivel: 'Primaria',
      desglose: [
        {
          documento: 'CI-SMOKE-1',
          conceptoNombre: 'Colegiatura',
          mesLabel: 'Septiembre',
          mesCargo: '9',
          subtotal: 3250,
          pagado: 0,
          saldo: 3250,
        }
      ],
    },
    matricula: '0000000000',
    ciclo: '2026-2027',
    mes: 9,
    subject: `IECS-IEDIS | Prueba de correo institucional | ${marker}`,
    includeDesglose: true,
  })

  const delivery = await sendEmail(TEST_EMAIL, rendered.subject, rendered.html)

  return {
    success: true,
    recipient: TEST_EMAIL,
    sender: delivery.sender,
    messageId: delivery.messageId,
    marker,
    institutionalTemplate: rendered.html.includes('data-iecs-iedis-email="cobranza-v2"'),
  }
})
