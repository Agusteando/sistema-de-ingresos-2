import { runWithBridgeAgentId } from '../utils/db'
import { recordGeneratedInvoice } from '../utils/student-invoices'

const LEGACY_CFDI_BASE_URL = String(
  process.env.CFDI_LEGACY_BASE_URL || 'https://update.casitaapps.com/api',
).replace(/\/+$/, '')

const text = (value: unknown) => String(value ?? '').trim()

const issueWithLegacyService = async (providerBody: unknown) => {
  try {
    return await $fetch(`${LEGACY_CFDI_BASE_URL}/saveCompanyAndGenerate`, {
      method: 'POST',
      body: providerBody,
      timeout: 60_000,
      retry: 0,
    }) as any
  } catch (error: any) {
    const providerPayload = error?.data || error?.response?._data || {}
    const providerStatus = Number(
      error?.response?.status
      || error?.statusCode
      || error?.status
      || 500,
    )
    const providerMessage = text(
      providerPayload?.error
      || providerPayload?.message
      || error?.statusMessage
      || error?.message
      || 'Error en comunicación con proveedor CFDI',
    )

    throw createError({
      statusCode: providerStatus,
      statusMessage: providerStatus >= 500
        ? 'Proveedor CFDI no disponible'
        : 'Solicitud CFDI rechazada',
      message: providerMessage,
      data: {
        providerStatus,
        providerMessage,
        source: 'factura-api-issuance',
      },
    })
  }
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const { localTracking, ...providerBody } = body || {}

  // Invoice issuance is intentionally single-path. The native adapter is not
  // attempted first because a provider/network ambiguity could otherwise create
  // duplicate CFDIs when falling back to the previously proven legacy service.
  const response = await issueWithLegacyService(providerBody)

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
