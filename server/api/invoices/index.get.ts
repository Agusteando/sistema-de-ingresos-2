import { proxyCfdiCompatEvent } from '../../utils/cfdi-compat'
import { runWithBridgeAgentId } from '../../utils/db'
import { listStudentInvoices } from '../../utils/student-invoices'

const text = (value: unknown) => String(value ?? '').trim()
const upper = (value: unknown) => text(value).toUpperCase()
const normalizeTaxId = (value: unknown) => upper(value).replace(/[\s\u200B-\u200D\uFEFF]+/g, '')

const cancellationLabel = (status: unknown, cancellationStatus: unknown) => {
  const normalizedStatus = text(status).toLowerCase()
  const cancellation = text(cancellationStatus || 'none').toLowerCase()
  if (normalizedStatus === 'canceled' || cancellation === 'accepted') return 'Cancelada'
  if (cancellation === 'pending') return 'Cancelación pendiente'
  if (cancellation === 'rejected') return 'Cancelación rechazada'
  if (normalizedStatus === 'valid' && cancellation === 'none') return 'Vigente'
  return cancellation || normalizedStatus || 'Desconocido'
}

const dateInRange = (value: unknown, from: unknown, to: unknown) => {
  const timestamp = Date.parse(text(value))
  if (!Number.isFinite(timestamp)) return !from && !to
  const fromTime = from ? Date.parse(`${text(from)}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY
  const toTime = to ? Date.parse(`${text(to)}T23:59:59.999Z`) : Number.POSITIVE_INFINITY
  return timestamp >= fromTime && timestamp <= toTime
}

const localStudentInvoiceResponse = async (event: any) => {
  const queryParams = getQuery(event) as Record<string, any>
  const matricula = text(queryParams.matricula)
  if (!matricula) return null

  const rows = await listStudentInvoices({ matricula, scope: 'all' })
  const requestedTaxId = normalizeTaxId(queryParams.tax_id || queryParams.taxId || queryParams.rfc)
  const requestedSeries = upper(queryParams.series)
  const requestedSearch = text(queryParams.q).toLowerCase()
  const requestedStatus = text(queryParams.status).toLowerCase()
  const requestedCancellation = text(queryParams.cancel_status || queryParams.cancellation_status).toLowerCase()
  const page = Math.max(1, Number.parseInt(text(queryParams.page) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(text(queryParams.limit) || '50', 10) || 50))

  const invoices = rows.map((invoice: any) => {
    const providerInvoiceId = text(invoice.providerInvoiceId)
    return {
      id: providerInvoiceId,
      invoice_id: providerInvoiceId,
      uuid: text(invoice.uuid),
      series: upper(invoice.series),
      folio_number: invoice.folioNumber ?? null,
      folio: text(invoice.folio),
      external_id: text(invoice.externalId),
      created_at: invoice.issuedAt || null,
      status: text(invoice.status),
      cancellation_status: text(invoice.cancellationStatus || 'none'),
      payment_form: text(invoice.paymentForm),
      currency: 'MXN',
      total: Number(invoice.total || 0),
      customer_tax_id: normalizeTaxId(invoice.receiverTaxId),
      customer_name: text(invoice.receiverName),
      customer_email: text(invoice.receiverEmail),
      matricula: text(invoice.matricula),
      cancel_status_label: cancellationLabel(invoice.status, invoice.cancellationStatus),
    }
  }).filter((invoice: any) => {
    if (upper(invoice.matricula) !== upper(matricula)) return false
    if (requestedTaxId && invoice.customer_tax_id !== requestedTaxId) return false
    if (requestedSeries && upper(invoice.series) !== requestedSeries) return false
    if (requestedStatus) {
      if (requestedStatus === 'canceled') {
        if (!(text(invoice.status).toLowerCase() === 'canceled' || text(invoice.cancellation_status).toLowerCase() === 'accepted')) return false
      } else if (text(invoice.status).toLowerCase() !== requestedStatus) return false
    }
    if (requestedCancellation && text(invoice.cancellation_status).toLowerCase() !== requestedCancellation) return false
    if (!dateInRange(invoice.created_at, queryParams.date_from, queryParams.date_to)) return false
    if (requestedSearch) {
      const haystack = [
        invoice.folio,
        invoice.uuid,
        invoice.customer_tax_id,
        invoice.customer_name,
        invoice.matricula,
      ].map(text).join(' ').toLowerCase()
      if (!haystack.includes(requestedSearch)) return false
    }
    return true
  })

  const sortBy = text(queryParams.sort_by || 'created_at')
  const direction = text(queryParams.sort_dir || 'desc').toLowerCase() === 'asc' ? 1 : -1
  invoices.sort((a: any, b: any) => {
    if (sortBy === 'folio') {
      return direction * text(a.folio).localeCompare(text(b.folio), 'es', { numeric: true })
    }
    if (sortBy === 'status') {
      return direction * text(a.cancel_status_label).localeCompare(text(b.cancel_status_label), 'es')
    }
    const aDate = Date.parse(text(a.created_at)) || 0
    const bDate = Date.parse(text(b.created_at)) || 0
    return direction * (aDate - bDate)
  })

  const total = invoices.length
  const pages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, pages)
  const offset = (safePage - 1) * limit

  return {
    success: true,
    total,
    pages,
    page: safePage,
    limit,
    sort_by: sortBy,
    sort_dir: direction === 1 ? 'asc' : 'desc',
    invoices: invoices.slice(offset, offset + limit),
    source: 'local-student-index',
  }
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const queryParams = getQuery(event) as Record<string, any>
  const matricula = text(queryParams.matricula)

  // Global invoice searches still depend on the live provider. For a student view,
  // however, Aurora already owns an exact matrícula-bound invoice index. Keep that
  // history visible if Facturapi is temporarily unavailable or the provider cannot
  // prove matrícula ownership for historical invoices that share a family RFC.
  if (!matricula) return proxyCfdiCompatEvent(event, 'invoices')

  try {
    const live = await proxyCfdiCompatEvent(event, 'invoices') as any
    if (Array.isArray(live?.invoices) && live.invoices.length > 0) return live

    try {
      const local = await localStudentInvoiceResponse(event)
      if (local && local.total > 0) {
        console.info('[CFDI] Historial del alumno servido desde índice local', {
          matricula,
          reason: 'provider_empty',
          total: local.total,
        })
        return local
      }
    } catch (localError: any) {
      console.warn('[CFDI] No se pudo consultar el índice local de facturas del alumno', {
        matricula,
        error: text(localError?.message),
      })
    }

    return live
  } catch (providerError: any) {
    try {
      const local = await localStudentInvoiceResponse(event)
      if (local && local.total > 0) {
        console.warn('[CFDI] Facturapi no disponible; se muestra historial local del alumno', {
          matricula,
          providerStatus: Number(providerError?.statusCode || providerError?.status || 0) || undefined,
          providerMessage: text(providerError?.data?.providerMessage || providerError?.message),
          total: local.total,
        })
        return {
          ...local,
          warning: 'El historial se muestra desde Aurora mientras se recupera la consulta en línea con Facturapi.',
        }
      }
    } catch (localError: any) {
      console.warn('[CFDI] Fallaron proveedor e índice local de facturas del alumno', {
        matricula,
        providerError: text(providerError?.data?.providerMessage || providerError?.message),
        localError: text(localError?.message),
      })
    }

    throw providerError
  }
}))
