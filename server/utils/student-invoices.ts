import { executeStatementTransaction, query, type SqlStatement } from './db'
import { normalizeCicloKey } from '../../shared/utils/ciclo'

const CFDI_BASE_URL = 'https://update.casitaapps.com/api'

const text = (value: unknown) => String(value ?? '').trim()
const upper = (value: unknown) => text(value).toUpperCase()
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const dateOrNull = (value: unknown) => {
  const raw = text(value)
  if (!raw) return null
  const parsed = value instanceof Date ? value : new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const INVOICE_TIME_ZONE = 'America/Mexico_City'
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
const explicitTimeZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * MySQL DATETIME is timezone-less and the DB bridge serializes Date objects as
 * ISO strings. Normalize invoice timestamps before crossing the bridge so the
 * agent receives `YYYY-MM-DD HH:mm:ss`, while preserving provider timestamps
 * that are already local and timezone-less.
 */
export const formatInvoiceDbDateTime = (value: unknown) => {
  const raw = text(value)
  if (!raw && !(value instanceof Date)) return null

  const localMatch = raw.match(localDateTimePattern)
  if (localMatch && !explicitTimeZonePattern.test(raw)) {
    const [, year, month, day, hour, minute, second = '00'] = localMatch
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  const date = dateOrNull(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INVOICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  const year = part('year')
  const month = part('month')
  const day = part('day')
  const hour = part('hour')
  const minute = part('minute')
  const second = part('second')
  return year && month && day && hour && minute && second
    ? `${year}-${month}-${day} ${hour}:${minute}:${second}`
    : null
}
const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return null
  }
}

const invoiceIdOf = (value: any) => text(
  value?.invoice_id
  || value?.provider_invoice_id
  || value?.factura?.id
  || value?.data?.invoice_id
  || value?.data?.factura?.id
  || value?.id,
)

const uuidOf = (value: any) => text(
  value?.uuid
  || value?.cfdi_uuid
  || value?.factura?.uuid
  || value?.data?.uuid
  || value?.data?.factura?.uuid,
)

const seriesOf = (value: any) => text(
  value?.series
  || value?.serie
  || value?.factura?.series
  || value?.factura?.serie
  || value?.data?.series,
).toUpperCase()

const folioNumberOf = (value: any) => numberOrNull(
  value?.folio_number
  || value?.folioNumber
  || value?.factura?.folio_number
  || value?.data?.folio_number,
)

const folioOf = (value: any) => {
  const explicit = text(value?.folio || value?.factura?.folio || value?.data?.folio)
  if (explicit) return explicit
  const series = seriesOf(value)
  const number = folioNumberOf(value)
  return `${series}${number ?? ''}`.trim()
}

const providerStatusOf = (value: any) => {
  const raw = text(
    value?.status
    || value?.estatus
    || value?.factura?.status
    || value?.data?.status
    || value?.data?.estatus
    || value?.data?.factura?.status,
  ).toLowerCase()
  if (raw.includes('cancel')) return 'canceled'
  if (raw === 'valid' || raw.includes('vigente') || raw.includes('active')) return 'valid'
  return raw || 'valid'
}

const cancellationStatusOf = (value: any) => {
  const raw = text(
    value?.cancellation_status
    || value?.cancel_status
    || value?.cancel_status_code
    || value?.factura?.cancellation_status
    || value?.data?.cancellation_status
    || value?.data?.cancel_status
    || value?.data?.factura?.cancellation_status,
  ).toLowerCase()
  const label = text(
    value?.cancel_status_label
    || value?.cancellation_status_label
    || value?.data?.cancel_status_label
    || value?.data?.cancellation_status_label,
  ).toLowerCase()
  const combined = `${raw} ${label}`
  if (combined.includes('pending') || combined.includes('pendiente')) return 'pending'
  if (combined.includes('accepted') || combined.includes('acept')) return 'accepted'
  if (combined.includes('rejected') || combined.includes('rechaz')) return 'rejected'
  if (combined.includes('cancel')) return 'accepted'
  return raw && raw !== 'null' ? raw : 'none'
}

const invoiceDateOf = (value: any) => dateOrNull(
  value?.issued_at
  || value?.created_at
  || value?.date
  || value?.fecha
  || value?.factura?.created_at
  || value?.data?.issued_at
  || value?.data?.created_at
  || value?.data?.date
  || value?.data?.factura?.created_at,
)

const cycleValues = (cycle: unknown) => {
  const key = normalizeCicloKey(cycle)
  const numeric = Number(key)
  return Array.from(new Set([
    key,
    Number.isFinite(numeric) ? `${key}-${numeric + 1}` : '',
  ].filter(Boolean)))
}

export type InvoiceSourcePayment = {
  folio?: number | null
  folio_plantel?: string | null
  documento?: number | null
  matricula?: string
  ciclo?: string | null
  concepto?: string | null
  monto?: number | null
}

export type GeneratedInvoiceTracking = {
  matricula?: string
  plantel?: string
  ciclo?: string
  sourcePayments?: InvoiceSourcePayment[]
}

const resolveTrackedSourcePayments = async (
  matricula: string,
  values: InvoiceSourcePayment[],
  fallbackCycle: string,
): Promise<InvoiceSourcePayment[]> => {
  const sources = (Array.isArray(values) ? values : []).filter(Boolean)
  if (!sources.length) return []

  const folios = Array.from(new Set(sources
    .map((source) => numberOrNull(source?.folio))
    .filter((folio): folio is number => folio !== null)))
  const foliosPlantel = Array.from(new Set(sources
    .map((source) => upper(source?.folio_plantel))
    .filter(Boolean)))

  let rows: any[] = []
  if (folios.length || foliosPlantel.length) {
    const clauses: string[] = []
    const params: any[] = [matricula]
    if (folios.length) {
      clauses.push('folio IN (?)')
      params.push(folios)
    }
    if (foliosPlantel.length) {
      clauses.push('UPPER(TRIM(CAST(folio_plantel AS CHAR))) IN (?)')
      params.push(foliosPlantel)
    }
    rows = await query<any[]>(
      `SELECT folio, folio_plantel, documento, matricula, ciclo, conceptoNombre, monto
       FROM referenciasdepago
       WHERE matricula = ? AND (${clauses.join(' OR ')})`,
      params,
    )
  }

  const byFolio = new Map(rows.map((row) => [Number(row.folio), row]))
  const byPlantel = new Map(rows
    .map((row) => [upper(row.folio_plantel), row] as const)
    .filter(([key]) => Boolean(key)))

  return sources.flatMap((source) => {
    const sourceFolio = numberOrNull(source?.folio)
    const sourcePlantel = upper(source?.folio_plantel)
    const row = (sourceFolio !== null ? byFolio.get(sourceFolio) : null)
      || (sourcePlantel ? byPlantel.get(sourcePlantel) : null)

    if (row) {
      return [{
        folio: numberOrNull(row.folio),
        folio_plantel: text(row.folio_plantel) || null,
        documento: numberOrNull(row.documento),
        matricula,
        ciclo: text(row.ciclo || fallbackCycle) || null,
        concepto: text(row.conceptoNombre || source?.concepto) || null,
        monto: numberOrNull(row.monto ?? source?.monto),
      }]
    }

    // A source without a payment identifier represents a document/concept
    // selection rather than a historical payment. Preserve that context, but
    // always bind it to the authoritative matrícula from the fiscal payload.
    if (sourceFolio === null && !sourcePlantel) {
      return [{
        folio: null,
        folio_plantel: null,
        documento: numberOrNull(source?.documento),
        matricula,
        ciclo: text(source?.ciclo || fallbackCycle) || null,
        concepto: text(source?.concepto) || null,
        monto: numberOrNull(source?.monto),
      }]
    }

    return []
  })
}

export const recordGeneratedInvoice = async ({
  requestBody,
  providerResponse,
  tracking,
  createdBy,
}: {
  requestBody: any
  providerResponse: any
  tracking?: GeneratedInvoiceTracking | null
  createdBy?: string
}) => {
  const invoiceId = invoiceIdOf(providerResponse)
  if (!invoiceId) throw new Error('El proveedor no devolvió un identificador de factura para indexarla.')

  const invoiceData = requestBody?.invoiceData || {}
  const companyData = requestBody?.companyData || {}
  const customer = invoiceData?.customer || {}
  const customerMatricula = text(customer?.matricula)
  const trackingMatricula = text(tracking?.matricula)
  if (customerMatricula && trackingMatricula && customerMatricula.toUpperCase() !== trackingMatricula.toUpperCase()) {
    throw new Error('La matrícula fiscal no coincide con la matrícula usada para registrar el historial.')
  }
  const matricula = text(customerMatricula || trackingMatricula)
  if (!matricula) throw new Error('La factura generada no incluye matrícula para el índice local.')

  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : []
  const total = items.reduce((sum: number, item: any) => {
    const quantity = Number(item?.quantity || 1)
    const price = Number(item?.product?.price || item?.price || 0)
    return sum + (Number.isFinite(quantity * price) ? quantity * price : 0)
  }, 0)

  const trackedSourcePayments = Array.isArray(tracking?.sourcePayments)
    ? tracking!.sourcePayments!.filter(Boolean)
    : []
  const requestedCycle = text(
    tracking?.ciclo
    || trackedSourcePayments.find((item) => text(item?.ciclo))?.ciclo,
  )
  const sourcePayments = await resolveTrackedSourcePayments(matricula, trackedSourcePayments, requestedCycle)
  const sourceFolios = sourcePayments
    .map((item) => text(item?.folio_plantel || item?.folio))
    .filter(Boolean)
  const cycle = text(
    sourcePayments.find((item) => text(item?.ciclo))?.ciclo
    || requestedCycle,
  )
  const providerInvoice = providerResponse?.factura || providerResponse?.data?.factura || providerResponse
  const providerIssuedAt = invoiceDateOf(providerInvoice)
  const issuedAt = formatInvoiceDbDateTime(providerIssuedAt || invoiceData?.date || new Date())
  if (!issuedAt) throw new Error('La fecha de emisión de la factura no pudo normalizarse para el historial local.')

  const invoiceValues = {
    uuid: uuidOf(providerInvoice) || null,
    plantel: upper(tracking?.plantel) || null,
    ciclo: cycle || null,
    series: seriesOf(providerInvoice) || null,
    folioNumber: folioNumberOf(providerInvoice),
    folio: folioOf(providerInvoice) || null,
    externalId: text(invoiceData?.external_id) || null,
    rfc: upper(customer?.tax_id || companyData?.tax_id),
    razonSocial: text(customer?.legal_name || companyData?.legal_name) || 'Receptor no identificado',
    regimenFiscal: text(customer?.tax_system || companyData?.tax_system) || null,
    usoCfdi: text(invoiceData?.use) || null,
    cp: text(customer?.address?.zip || companyData?.zip) || null,
    correo: text(customer?.email || companyData?.email) || null,
    total: Number(total.toFixed(2)),
    folios: sourceFolios.join(','),
    paymentForm: text(invoiceData?.payment_form) || null,
    status: providerStatusOf(providerInvoice),
    cancellationStatus: cancellationStatusOf(providerInvoice),
    issuedAt,
    providerCreatedAt: formatInvoiceDbDateTime(providerIssuedAt),
    createdBy: text(createdBy) || null,
    snapshot: safeJson(providerResponse),
  }

  const [existing] = await query<any[]>(
    `SELECT id FROM facturas WHERE provider_invoice_id = ? ORDER BY id ASC LIMIT 1`,
    [invoiceId],
  )

  if (existing?.id) {
    await query(
      `UPDATE facturas SET
        uuid = ?, matricula = ?, plantel = ?, ciclo = ?, series = ?, folio_number = ?, folio = ?,
        external_id = ?, rfc = ?, razonSocial = ?, regimenFiscal = ?, usoCfdi = ?, cp = ?, correo = ?,
        total = ?, folios = ?, payment_form = ?, status = ?, cancellation_status = ?, issued_at = ?,
        provider_created_at = ?, last_synced_at = CURRENT_TIMESTAMP, created_by = COALESCE(?, created_by),
        provider_snapshot = ?
       WHERE id = ?`,
      [
        invoiceValues.uuid, matricula, invoiceValues.plantel, invoiceValues.ciclo,
        invoiceValues.series, invoiceValues.folioNumber, invoiceValues.folio, invoiceValues.externalId,
        invoiceValues.rfc, invoiceValues.razonSocial, invoiceValues.regimenFiscal, invoiceValues.usoCfdi,
        invoiceValues.cp, invoiceValues.correo, invoiceValues.total, invoiceValues.folios,
        invoiceValues.paymentForm, invoiceValues.status, invoiceValues.cancellationStatus,
        invoiceValues.issuedAt, invoiceValues.providerCreatedAt, invoiceValues.createdBy,
        invoiceValues.snapshot, existing.id,
      ],
    )
  } else {
    await query(
      `INSERT INTO facturas (
        provider_invoice_id, uuid, matricula, plantel, ciclo, series, folio_number, folio,
        external_id, rfc, razonSocial, regimenFiscal, usoCfdi, cp, correo, total, folios,
        payment_form, status, cancellation_status, issued_at, provider_created_at,
        last_synced_at, created_by, provider_snapshot, fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [
        invoiceId, invoiceValues.uuid, matricula, invoiceValues.plantel, invoiceValues.ciclo,
        invoiceValues.series, invoiceValues.folioNumber, invoiceValues.folio, invoiceValues.externalId,
        invoiceValues.rfc, invoiceValues.razonSocial, invoiceValues.regimenFiscal, invoiceValues.usoCfdi,
        invoiceValues.cp, invoiceValues.correo, invoiceValues.total, invoiceValues.folios,
        invoiceValues.paymentForm, invoiceValues.status, invoiceValues.cancellationStatus,
        invoiceValues.issuedAt, invoiceValues.providerCreatedAt, invoiceValues.createdBy,
        invoiceValues.snapshot, invoiceValues.issuedAt,
      ],
    )
  }


  const [stored] = await query<any[]>(
    `SELECT id FROM facturas WHERE provider_invoice_id = ? LIMIT 1`,
    [invoiceId],
  )
  if (!stored?.id) throw new Error('La factura se emitió, pero no se pudo resolver su registro local.')

  const statements: SqlStatement[] = [
    { sql: `DELETE FROM factura_pagos WHERE factura_id = ?`, params: [stored.id] },
  ]

  sourcePayments.forEach((payment) => {
    statements.push({
      sql: `INSERT INTO factura_pagos
        (factura_id, folio, folio_plantel, documento, matricula, ciclo, concepto, monto)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        stored.id,
        numberOrNull(payment?.folio),
        text(payment?.folio_plantel) || null,
        numberOrNull(payment?.documento),
        matricula,
        text(payment?.ciclo || cycle) || null,
        text(payment?.concepto) || null,
        numberOrNull(payment?.monto),
      ],
    })
  })

  await executeStatementTransaction(statements)
  return { id: Number(stored.id), providerInvoiceId: invoiceId }
}

const normalizeProviderInvoice = (invoice: any) => ({
  providerInvoiceId: invoiceIdOf(invoice),
  uuid: uuidOf(invoice),
  series: seriesOf(invoice),
  folioNumber: folioNumberOf(invoice),
  folio: folioOf(invoice),
  status: providerStatusOf(invoice),
  cancellationStatus: cancellationStatusOf(invoice),
  issuedAt: invoiceDateOf(invoice),
  receiverName: text(invoice?.customer_name || invoice?.customer?.legal_name || invoice?.legal_name),
  receiverTaxId: upper(invoice?.customer_tax_id || invoice?.customer?.tax_id || invoice?.tax_id),
  receiverEmail: text(invoice?.customer_email || invoice?.customer?.email || invoice?.email),
  total: numberOrNull(invoice?.total || invoice?.amount || invoice?.factura?.total),
  paymentForm: text(invoice?.payment_form),
  matricula: text(invoice?.matricula || invoice?.customer?.matricula),
  externalId: text(invoice?.external_id),
  raw: invoice,
})

const backfillProviderInvoice = async ({ invoice, matricula, taxId }: { invoice: ReturnType<typeof normalizeProviderInvoice>; matricula: string; taxId: string }) => {
  if (!invoice.providerInvoiceId) return null

  let sourcePayment: any = null
  if (invoice.externalId) {
    const [matchedPayment] = await query<any[]>(
      `SELECT folio, folio_plantel, documento, matricula, ciclo, conceptoNombre, monto
       FROM referenciasdepago
       WHERE matricula = ? AND UPPER(TRIM(CAST(folio_plantel AS CHAR))) = ?
       ORDER BY folio DESC LIMIT 1`,
      [matricula, upper(invoice.externalId)],
    )
    sourcePayment = matchedPayment || null
  }
  const [student] = await query<any[]>(
    `SELECT plantel, ciclo FROM base WHERE matricula = ? LIMIT 1`,
    [matricula],
  )
  const inferredCycle = text(sourcePayment?.ciclo || student?.ciclo)
  const inferredPlantel = upper(student?.plantel)
  const issuedAt = formatInvoiceDbDateTime(invoice.issuedAt || new Date())
  if (!issuedAt) return null

  await query(
    `INSERT INTO facturas (
      provider_invoice_id, uuid, matricula, plantel, ciclo, series, folio_number, folio, external_id,
      rfc, razonSocial, correo, total, folios, payment_form, status, cancellation_status,
      issued_at, provider_created_at, last_synced_at, provider_snapshot, fecha
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)` ,
    [
      invoice.providerInvoiceId,
      invoice.uuid || null,
      matricula,
      inferredPlantel || null,
      inferredCycle || null,
      invoice.series || null,
      invoice.folioNumber,
      invoice.folio || null,
      invoice.externalId || null,
      invoice.receiverTaxId || taxId,
      invoice.receiverName || 'Receptor no identificado',
      invoice.receiverEmail || null,
      Number(invoice.total || 0),
      invoice.externalId || '',
      invoice.paymentForm || null,
      invoice.status,
      invoice.cancellationStatus,
      issuedAt,
      formatInvoiceDbDateTime(invoice.issuedAt),
      safeJson(invoice.raw),
      issuedAt,
    ],
  )
  const [stored] = await query<any[]>(
    `SELECT id FROM facturas WHERE provider_invoice_id = ? ORDER BY id ASC LIMIT 1`,
    [invoice.providerInvoiceId],
  )
  if (stored?.id && invoice.externalId) {
    await query(
      `INSERT INTO factura_pagos
        (factura_id, folio, folio_plantel, documento, matricula, ciclo, concepto, monto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        stored.id,
        numberOrNull(sourcePayment?.folio),
        invoice.externalId,
        numberOrNull(sourcePayment?.documento),
        matricula,
        text(sourcePayment?.ciclo || inferredCycle) || null,
        text(sourcePayment?.conceptoNombre) || 'Referencia importada del proveedor',
        numberOrNull(sourcePayment?.monto),
      ],
    )
  }
  return stored || null
}


const providerInvoiceBelongsToStudent = async (
  invoice: ReturnType<typeof normalizeProviderInvoice>,
  matricula: string,
) => {
  if (text(invoice.matricula).toUpperCase() === text(matricula).toUpperCase()) return true
  if (!invoice.externalId) return false

  const [matchedPayment] = await query<any[]>(
    `SELECT folio FROM referenciasdepago
     WHERE matricula = ? AND UPPER(TRIM(CAST(folio_plantel AS CHAR))) = ?
     LIMIT 1`,
    [matricula, upper(invoice.externalId)],
  )
  return Boolean(matchedPayment?.folio)
}

const providerInvoicesForTaxId = async (taxId: string) => {
  const invoices: any[] = []
  const limit = 100
  let page = 1
  let pages = 1

  do {
    const response = await $fetch<any>(`${CFDI_BASE_URL}/invoices`, {
      params: {
        tax_id: taxId,
        sort_by: 'created_at',
        sort_dir: 'desc',
        page,
        limit,
      },
    })
    if (response?.success === false) throw new Error(text(response?.error || response?.message) || 'El proveedor rechazó la consulta.')

    const pageInvoices = Array.isArray(response?.invoices)
      ? response.invoices
      : (Array.isArray(response?.data?.invoices) ? response.data.invoices : [])
    invoices.push(...pageInvoices)

    const reportedPages = Number(response?.pages || response?.data?.pages || 1)
    pages = Number.isFinite(reportedPages) && reportedPages > 0 ? Math.min(reportedPages, 20) : 1
    page += 1
  } while (page <= pages)

  const unique = new Map<string, any>()
  invoices.forEach((invoice) => {
    const id = invoiceIdOf(invoice)
    if (id && !unique.has(id)) unique.set(id, invoice)
  })
  return Array.from(unique.values())
}

export const syncStudentInvoices = async (matricula: string) => {
  const local = await query<any[]>(
    `SELECT id, provider_invoice_id, rfc FROM facturas WHERE matricula = ? ORDER BY fecha DESC`,
    [matricula],
  )
  const taxIdSet = new Set(local.map((row) => upper(row.rfc)).filter(Boolean))
  const warnings: string[] = []
  try {
    const companyResponse = await $fetch<any>(`${CFDI_BASE_URL}/getCompanyData`, { params: { matricula } })
    if (companyResponse?.success === false) {
      throw new Error(text(companyResponse?.error || companyResponse?.message) || 'El proveedor rechazó la consulta del perfil fiscal.')
    }
    const companyTaxId = upper(companyResponse?.data?.tax_id || companyResponse?.tax_id)
    if (companyTaxId) taxIdSet.add(companyTaxId)
  } catch (error: any) {
    warnings.push(`No se pudo consultar el perfil fiscal actual: ${text(error?.data?.message || error?.message) || 'error del proveedor'}`)
  }

  const taxIds = Array.from(taxIdSet).slice(0, 5)
  if (!taxIds.length) return { updated: 0, warning: warnings.join(' ') }

  const localByProvider = new Map(local.map((row) => [text(row.provider_invoice_id), row]))
  let updated = 0

  for (const taxId of taxIds) {
    try {
      const providerRows = await providerInvoicesForTaxId(taxId)
      for (const rawInvoice of providerRows) {
        const invoice = normalizeProviderInvoice(rawInvoice)
        if (!invoice.providerInvoiceId) continue
        let localRow = localByProvider.get(invoice.providerInvoiceId)
        if (!localRow) {
          if (!await providerInvoiceBelongsToStudent(invoice, matricula)) continue
          const stored = await backfillProviderInvoice({ invoice, matricula, taxId })
          if (!stored?.id) continue
          localRow = { id: stored.id, provider_invoice_id: invoice.providerInvoiceId, rfc: taxId }
          localByProvider.set(invoice.providerInvoiceId, localRow)
        }

        await query(
          `UPDATE facturas SET
            uuid = COALESCE(NULLIF(?, ''), uuid),
            series = COALESCE(NULLIF(?, ''), series),
            folio_number = COALESCE(?, folio_number),
            folio = COALESCE(NULLIF(?, ''), folio),
            status = CASE
              WHEN status = 'canceled' AND ? = 'valid' THEN status
              ELSE ?
            END,
            cancellation_status = CASE
              WHEN cancellation_status = 'pending' AND ? = 'none' THEN cancellation_status
              ELSE ?
            END,
            correo = COALESCE(NULLIF(?, ''), correo),
            payment_form = COALESCE(NULLIF(?, ''), payment_form),
            provider_created_at = COALESCE(?, provider_created_at),
            provider_snapshot = ?,
            last_synced_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            invoice.uuid,
            invoice.series,
            invoice.folioNumber,
            invoice.folio,
            invoice.status,
            invoice.status,
            invoice.cancellationStatus,
            invoice.cancellationStatus,
            invoice.receiverEmail,
            invoice.paymentForm,
            formatInvoiceDbDateTime(invoice.issuedAt),
            safeJson(rawInvoice),
            localRow.id,
          ],
        )
        updated += 1
      }
    } catch (error: any) {
      warnings.push(`No se pudo sincronizar el RFC ${taxId}: ${text(error?.data?.message || error?.message) || 'error del proveedor'}`)
    }
  }

  return { updated, warning: warnings.join(' ') }
}

export const updateLocalInvoiceCancellation = async ({
  providerInvoiceId,
  providerResponse,
}: {
  providerInvoiceId: string
  providerResponse: any
}) => {
  const status = providerStatusOf(providerResponse)
  const cancellationStatus = cancellationStatusOf(providerResponse)
  await query(
    `UPDATE facturas SET
      status = CASE WHEN ? = 'canceled' THEN 'canceled' ELSE status END,
      cancellation_status = ?,
      provider_snapshot = ?,
      last_synced_at = CURRENT_TIMESTAMP
    WHERE provider_invoice_id = ?`,
    [status, cancellationStatus === 'none' ? 'pending' : cancellationStatus, safeJson(providerResponse), providerInvoiceId],
  )
}

export const listStudentInvoices = async ({
  matricula,
  cycle,
  scope = 'current',
}: {
  matricula: string
  cycle?: unknown
  scope?: string
}) => {
  const values = cycleValues(cycle)
  const params: any[] = [matricula]
  let cycleWhere = ''

  if (scope !== 'all' && values.length) {
    cycleWhere = `AND (
      CAST(f.ciclo AS CHAR) IN (${values.map(() => '?').join(',')})
      OR EXISTS (
        SELECT 1 FROM factura_pagos fp_cycle
        WHERE fp_cycle.factura_id = f.id
          AND CAST(fp_cycle.ciclo AS CHAR) IN (${values.map(() => '?').join(',')})
      )
    )`
    params.push(...values, ...values)
  }

  const rows = await query<any[]>(
    `SELECT f.*
     FROM facturas f
     WHERE f.matricula = ?
       ${cycleWhere}
     ORDER BY COALESCE(f.issued_at, f.fecha) DESC, f.id DESC`,
    params,
  )

  if (!rows.length) return []
  const ids = rows.map((row) => Number(row.id)).filter(Boolean)
  const sourceRows = ids.length
    ? await query<any[]>(
      `SELECT factura_id, folio, folio_plantel, documento, matricula, ciclo, concepto, monto
       FROM factura_pagos
       WHERE factura_id IN (?)
       ORDER BY id ASC`,
      [ids],
    )
    : []
  const sourcesByInvoice = new Map<number, any[]>()
  sourceRows.forEach((source) => {
    const id = Number(source.factura_id)
    const list = sourcesByInvoice.get(id) || []
    list.push({
      folio: numberOrNull(source.folio),
      folioPlantel: text(source.folio_plantel),
      documento: numberOrNull(source.documento),
      matricula: text(source.matricula),
      ciclo: text(source.ciclo),
      concepto: text(source.concepto),
      monto: numberOrNull(source.monto),
    })
    sourcesByInvoice.set(id, list)
  })

  return rows.map((row) => ({
    id: Number(row.id),
    providerInvoiceId: text(row.provider_invoice_id),
    uuid: text(row.uuid),
    matricula: text(row.matricula),
    plantel: upper(row.plantel),
    ciclo: text(row.ciclo),
    series: text(row.series),
    folioNumber: numberOrNull(row.folio_number),
    folio: text(row.folio) || `${text(row.series)}${text(row.folio_number)}`,
    externalId: text(row.external_id),
    receiverName: text(row.razonSocial),
    receiverTaxId: upper(row.rfc),
    receiverEmail: text(row.correo),
    total: Number(row.total || 0),
    paymentForm: text(row.payment_form),
    status: providerStatusOf(row),
    cancellationStatus: cancellationStatusOf(row),
    issuedAt: row.issued_at || row.fecha,
    lastSyncedAt: row.last_synced_at,
    sourcePayments: sourcesByInvoice.get(Number(row.id)) || [],
    actionable: Boolean(text(row.provider_invoice_id)),
  }))
}
