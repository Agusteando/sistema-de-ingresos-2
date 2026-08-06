import { proxyCfdiEvent } from '../utils/cfdi-proxy'
import { runWithBridgeAgentId } from '../utils/db'
import { recordGeneratedInvoice } from '../utils/student-invoices'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const { localTracking, ...providerBody } = body || {}
  const response = await proxyCfdiEvent(event, 'saveCompanyAndGenerate', { body: providerBody }) as any

  if (response?.success) {
    try {
      const stored = await recordGeneratedInvoice({
        requestBody: providerBody,
        providerResponse: response,
        tracking: localTracking,
        createdBy: event.context.user?.email || event.context.user?.name || '',
      })
      return { ...response, local_indexed: true, local_invoice_id: stored.id }
    } catch (error: any) {
      console.error('[InvoiceIndex] La factura fue emitida pero no pudo indexarse localmente:', error)
      return {
        ...response,
        local_indexed: false,
        local_index_warning: 'La factura sí fue emitida, pero el historial local no pudo actualizarse. No generes otra factura para estos pagos; abre Facturas y pulsa Actualizar para recuperarla.',
        local_index_error_code: String(error?.code || error?.diagnostic?.code || '').trim() || undefined,
      }
    }
  }

  return response
}))
