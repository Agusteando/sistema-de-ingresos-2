import { proxyCfdiEvent } from '../../../utils/cfdi-proxy'
import { runWithBridgeAgentId } from '../../../utils/db'
import { updateLocalInvoiceCancellation } from '../../../utils/student-invoices'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) throw createError({ statusCode: 400, message: 'Identificador de factura requerido.' })

  const body = await readBody(event)
  const response = await proxyCfdiEvent(event, `invoices/${encodeURIComponent(id)}/cancel`, { body }) as any

  if (response?.success !== false) {
    try {
      await updateLocalInvoiceCancellation({ providerInvoiceId: id, providerResponse: response })
    } catch (error) {
      console.error('[InvoiceIndex] No se pudo actualizar el estado local de cancelación:', error)
    }
  }

  return response
}))
