import { sendEmail } from '../../utils/mailer'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { folios, email } = body

  if (!folios || !email) {
    throw createError({ statusCode: 400, message: 'Faltan parámetros obligatorios.' })
  }

  const folioList = Array.isArray(folios) ? folios.map(Number) : String(folios).split(',').map(Number)

  const items = await prisma.referenciasDePago.findMany({
    where: { folio: { in: folioList }, estatus: 'Vigente' }
  })

  if (!items.length) {
    throw createError({ statusCode: 404, message: 'Recibos no vigentes o no encontrados.' })
  }

  const total = items.reduce((sum, item) => sum + Number(item.monto), 0)
  
  const templateRows = items.map(i => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${i.conceptoNombre}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${i.mesReal || i.mes}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">$${Number(i.monto).toFixed(2)}</td>
    </tr>
  `).join('')

  const htmlContent = `
    <div style="font-family: 'Inter', sans-serif; color: #1F2937; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #E5E7EB; border-radius: 12px;">
      <h2 style="color: #4E844E; margin-bottom: 20px;">Comprobante de Pago Institucional</h2>
      <p>Estimado(a), adjunto encontrará el desglose de su pago procesado en el Instituto.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
        <thead>
          <tr style="background-color: #F9FAFB;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #E5E7EB;">Concepto</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #E5E7EB;">Mes</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #E5E7EB;">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${templateRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 15px 10px; text-align: right; font-weight: bold;">Total Operación:</td>
            <td style="padding: 15px 10px; text-align: right; font-weight: bold; color: #4E844E;">$${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      
      <p style="margin-top: 30px; font-size: 12px; color: #6B7280;">Este documento es de carácter informativo. Conserve su comprobante para futuras aclaraciones.</p>
    </div>
  `

  await sendEmail(email, 'Comprobante de Pago Institucional', htmlContent)
  return { success: true }
})