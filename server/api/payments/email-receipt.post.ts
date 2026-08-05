import { sendEmailFromUser } from '../../utils/mailer'
import { runWithBridgeAgentId } from '../../utils/db'
import { loadPaymentReceiptDocument } from '../../utils/paymentReceipt'
import { generatePaymentReceiptPdf, renderPaymentReceiptEmail } from '../../utils/paymentReceiptDelivery'

const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim()
  const user = event.context.user

  if (!validEmail(email)) {
    throw createError({ statusCode: 400, message: 'El correo electrónico destino no es válido.' })
  }
  if (!user?.email) {
    throw createError({ statusCode: 401, message: 'No se pudo identificar el correo del usuario autenticado.' })
  }

  const receipt = await loadPaymentReceiptDocument(body?.folios)
  if (!receipt.folios.length) {
    throw createError({ statusCode: 400, message: 'Faltan los folios del recibo.' })
  }
  if (!receipt.items.length) {
    throw createError({ statusCode: 404, message: 'Recibos no vigentes o no encontrados.' })
  }

  const sentByName = String(user.name || user.email).trim()
  const delivery = renderPaymentReceiptEmail({
    items: receipt.items,
    sentByName,
    sentByEmail: user.email,
    issuedAt: receipt.issuedAt,
  })
  const pdf = generatePaymentReceiptPdf({
    items: receipt.items,
    issuedAt: receipt.issuedAt,
  })

  await sendEmailFromUser(
    email,
    delivery.subject,
    delivery.html,
    user.email,
    [{ filename: delivery.filename, content: pdf, contentType: 'application/pdf' }],
    delivery.text,
  )

  return {
    success: true,
    sender: user.email,
    recipient: email,
    attachment: delivery.filename,
    payments: receipt.items.length,
  }
}))
