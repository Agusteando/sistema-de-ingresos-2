import { proxyCfdiEvent } from '../utils/cfdi-proxy'
import { runWithBridgeAgentId } from '../utils/db'
import { recordGeneratedInvoice } from '../utils/student-invoices'

const cleanText = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

const classifyCfdiError = (statusCode: number, providerStatus: number | null, mutationUncertain: boolean) => {
  if (mutationUncertain) return 'CFDI_EMISSION_UNCONFIRMED'
  const effectiveStatus = providerStatus || statusCode
  if (effectiveStatus === 504) return 'CFDI_PROVIDER_TIMEOUT'
  if ([408, 425, 429, 502, 503].includes(effectiveStatus)) return 'CFDI_PROVIDER_UNAVAILABLE'
  if (providerStatus && effectiveStatus >= 500) return 'CFDI_PROVIDER_ERROR'
  if (statusCode >= 500) return 'CFDI_INTERNAL_ERROR'
  if ([400, 422].includes(statusCode)) return 'CFDI_VALIDATION_ERROR'
  if ([401, 403].includes(statusCode)) return 'CFDI_AUTH_ERROR'
  if (statusCode === 404) return 'CFDI_NOT_FOUND'
  return 'CFDI_REQUEST_ERROR'
}

const publicCfdiMessage = ({
  statusCode,
  providerStatus,
  providerMessage,
  mutationUncertain,
}: {
  statusCode: number
  providerStatus: number | null
  providerMessage: string
  mutationUncertain: boolean
}) => {
  if (mutationUncertain) {
    return 'No se pudo confirmar si el CFDI terminó de emitirse. Consulta Facturas antes de volver a intentarlo.'
  }
  const effectiveStatus = providerStatus || statusCode
  if (effectiveStatus === 504) return 'Facturapi tardó demasiado en responder.'
  if ([408, 425, 429, 502, 503].includes(effectiveStatus)) return 'Facturapi no respondió correctamente en este momento.'
  if (statusCode < 500 && providerMessage) return providerMessage
  return 'Aurora no pudo completar la emisión del CFDI.'
}

const cfdiFailureResponse = (event: any, error: any) => {
  const data = error?.data && typeof error.data === 'object' ? error.data : {}
  const rawStatus = Number(error?.statusCode || error?.status || error?.response?.status || data?.providerStatus || 500)
  const statusCode = Number.isFinite(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500
  const rawProviderStatus = Number(data?.providerStatus || 0)
  const providerStatus = Number.isFinite(rawProviderStatus) && rawProviderStatus >= 400 && rawProviderStatus <= 599
    ? rawProviderStatus
    : null
  const internalMessage = cleanText(
    data?.providerMessage
    || data?.message
    || error?.statusMessage
    || error?.message,
  )
  const mutationUncertain = Boolean(data?.mutationUncertain)
    || /No repitas la operación sin verificar/i.test(internalMessage)
  const code = classifyCfdiError(statusCode, providerStatus, mutationUncertain)
  const message = publicCfdiMessage({
    statusCode,
    providerStatus,
    providerMessage: internalMessage,
    mutationUncertain,
  })
  const requestId = cleanText(event.context.auroraRequestId, 80) || undefined
  const providerCode = cleanText(data?.providerCode, 120) || undefined
  const providerPath = cleanText(data?.providerPath, 240) || undefined
  const retryable = mutationUncertain || RETRYABLE_STATUSES.has(providerStatus || statusCode)

  console.error('[CFDI] No se pudo completar saveCompanyAndGenerate', {
    requestId,
    code,
    statusCode,
    providerStatus,
    providerCode,
    providerPath,
    mutationUncertain,
    retryable,
    message: internalMessage || undefined,
    errorCode: cleanText(error?.code || error?.cause?.code, 120) || undefined,
    cause: cleanText(error?.cause?.message, 300) || undefined,
  })

  setResponseStatus(event, statusCode)
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'cache-control', 'private, no-store')

  return {
    success: false,
    error: message,
    message,
    code,
    retryable,
    mutationUncertain,
    requestId,
    providerStatus: providerStatus || undefined,
    providerCode,
    providerPath,
  }
}

export default defineEventHandler(async (event) => {
  try {
    return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
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
    })
  } catch (error: any) {
    return cfdiFailureResponse(event, error)
  }
})
