import { runWithBridgeAgentId } from '../../utils/db'
import { loadPaymentReceiptDocument } from '../../utils/paymentReceipt'
import { generatePaymentReceiptPdf, paymentReceiptFilename } from '../../utils/paymentReceiptDelivery'

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return firstQueryValue(value[0])
  return String(value ?? '').trim()
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const query = getQuery(event)
  const receipt = await loadPaymentReceiptDocument(query.folios)

  if (!receipt.folios.length) {
    throw createError({ statusCode: 400, message: 'Faltan los folios del recibo.' })
  }
  if (!receipt.items.length) {
    throw createError({ statusCode: 404, message: 'Recibos no vigentes o no encontrados.' })
  }

  const pdf = generatePaymentReceiptPdf({
    items: receipt.items,
    issuedAt: receipt.issuedAt,
  })
  const filename = paymentReceiptFilename(receipt.items).replace(/["\\\r\n]/g, '-')
  const download = ['1', 'true', 'attachment'].includes(firstQueryValue(query.download || query.disposition).toLowerCase())

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Length', String(pdf.length))
  setHeader(event, 'Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`)
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')

  return pdf
}))
