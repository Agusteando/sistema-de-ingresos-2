import { proxyCfdiCompatEvent } from '../../utils/cfdi-compat'

const cfdiErrorResponse = (event: any, error: any) => {
  const status = Number(
    error?.statusCode
    || error?.status
    || error?.response?.status
    || error?.data?.providerStatus
    || 500,
  ) || 500
  const providerMessage = String(
    error?.data?.providerMessage
    || error?.data?.message
    || error?.statusMessage
    || error?.message
    || 'No se pudo consultar Facturapi.',
  ).trim()

  setResponseStatus(event, status)
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'cache-control', 'private, no-store')
  return {
    success: false,
    error: providerMessage,
    message: providerMessage,
    providerMessage,
    providerStatus: status,
    invoices: [],
    total: 0,
    pages: 1,
    page: 1,
  }
}

export default defineEventHandler(async (event) => {
  try {
    return await proxyCfdiCompatEvent(event, 'invoices')
  } catch (error: any) {
    console.error('[CFDI] No se pudo listar facturas desde Facturapi', {
      matricula: String(getQuery(event)?.matricula || '').trim(),
      status: Number(error?.statusCode || error?.status || error?.data?.providerStatus || 500) || 500,
      message: String(error?.data?.providerMessage || error?.message || '').trim(),
    })
    return cfdiErrorResponse(event, error)
  }
})
