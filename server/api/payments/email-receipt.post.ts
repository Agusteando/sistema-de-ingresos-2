import { sendEmailFromUser } from '../../utils/mailer'
import { runWithBridgeAgentId, query } from '../../utils/db'
import { loadActiveReceiptPayments, resolveReceiptAcademicPlacement } from '../../utils/paymentReceipt'
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

  const { folios: normalizedFolios, items, matricula } = await loadActiveReceiptPayments(body?.folios)
  if (!normalizedFolios.length) {
    throw createError({ statusCode: 400, message: 'Faltan los folios del recibo.' })
  }
  if (!items.length) {
    throw createError({ statusCode: 404, message: 'Recibos no vigentes o no encontrados.' })
  }

  const [studentData] = await query<any[]>(
    `SELECT grado, grupo, plantel, nivel, ciclo FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )
  const academicPlacement = resolveReceiptAcademicPlacement(studentData, items[0]?.ciclo)
  const receiptItems = items.map((item) => ({
    ...item,
    grado: academicPlacement.grado,
    grupo: studentData?.grupo || '',
    nivel: academicPlacement.nivel,
  }))

  const issuedAt = new Date()
  const sentByName = String(user.name || user.email).trim()
  const delivery = renderPaymentReceiptEmail({
    items: receiptItems,
    sentByName,
    sentByEmail: user.email,
    issuedAt,
  })
  const pdf = generatePaymentReceiptPdf({
    items: receiptItems,
    sentByName,
    sentByEmail: user.email,
    issuedAt,
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
    payments: receiptItems.length,
  }
}))
