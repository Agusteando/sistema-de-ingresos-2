import { getCfdiCompanyData, listCfdiInvoices } from '../../utils/cfdi-proxy'

const emptyInvoiceResult = (queryParams: Record<string, any> = {}) => ({
  success: true,
  total: 0,
  pages: 1,
  page: 1,
  limit: Math.min(100, Math.max(1, Number.parseInt(String(queryParams.limit || '50'), 10) || 50)),
  sort_by: String(queryParams.sort_by || 'created_at'),
  sort_dir: String(queryParams.sort_dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
  invoices: [],
})

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
  const queryParams = getQuery(event) as Record<string, any>
  const matricula = String(queryParams.matricula || '').trim()

  try {
    if (!matricula) return await listCfdiInvoices(queryParams)

    // Student Details is a fiscal-recipient lookup. The matrícula resolves the
    // authoritative RFC, then Facturapi is queried for that RFC across every
    // emitter historically associated with it. Facturapi invoices do not carry
    // Aurora matrícula reliably, so matrícula must not be a hard provider-row
    // filter after the RFC has already been established.
    const company = await getCfdiCompanyData(matricula)
    const taxId = String(company?.data?.tax_id || '').trim().toUpperCase()
    if (!taxId) return emptyInvoiceResult(queryParams)

    const {
      matricula: _matricula,
      tax_id: _clientTaxId,
      facturaCon: _facturaCon,
      factura_con: _facturaConSnake,
      ...invoiceFilters
    } = queryParams

    return await listCfdiInvoices({
      ...invoiceFilters,
      tax_id: taxId,
    })
  } catch (error: any) {
    console.error('[CFDI] No se pudo listar facturas desde Facturapi', {
      matricula,
      status: Number(error?.statusCode || error?.status || error?.data?.providerStatus || 500) || 500,
      message: String(error?.data?.providerMessage || error?.message || '').trim(),
    })
    return cfdiErrorResponse(event, error)
  }
})
