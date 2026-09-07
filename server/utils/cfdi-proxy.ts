import { query } from './db'

const FACTURAPI_BASE_URL = 'https://www.facturapi.io/v2'
const DEFAULT_TIMEOUT_MS = 60_000
const IEDIS_PREFIXES = new Set(['PT', 'PM', 'SM', 'ST', 'DM'])
const IECS_SERIES = new Set(['CM', 'CT'])
const SUCURSAL_MAP: Record<string, string> = {
  CT: 'CASITA TOLUCA',
  CM: 'CASITA METEPEC',
  DM: 'DESARROLLO METEPEC',
  PR: 'PREESCOLAR METEPEC',
  CO: 'CASITA OCOYOACAC',
  PM: 'PRIMARIA METEPEC',
  PT: 'PRIMARIA TOLUCA',
  SM: 'SECUNDARIA METEPEC',
  ST: 'SECUNDARIA TOLUCA',
}

type FacturapiAccount = 'IEDIS' | 'IECS' | 'SILVIA'

type ProviderCallOptions = {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  download?: boolean
  testMode?: boolean
}

const text = (value: unknown) => String(value ?? '').trim()
const upper = (value: unknown) => text(value).toUpperCase()
const bool = (value: unknown) => value === true || ['1', 'true', 'yes', 'si', 'sí'].includes(text(value).toLowerCase())

export const resolveCfdiPath = (pathParam: unknown) => Array.isArray(pathParam)
  ? pathParam.join('/')
  : String(pathParam || '')

const configuredAccounts = (testMode = false): FacturapiAccount[] => {
  const suffix = testMode ? 'TEST' : 'LIVE'
  return (['IEDIS', 'IECS', 'SILVIA'] as FacturapiAccount[]).filter((account) => Boolean(
    text(process.env[`FACTURAPI_${suffix}_KEY_${account}`]),
  ))
}

const keyFor = (account: FacturapiAccount, testMode = false) => {
  const suffix = testMode ? 'TEST' : 'LIVE'
  const key = text(process.env[`FACTURAPI_${suffix}_KEY_${account}`])
  if (!key) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Facturapi no configurado en Aurora',
      message: `Falta FACTURAPI_${suffix}_KEY_${account} en el entorno de Aurora.`,
    })
  }
  return key
}

const accountFromHints = ({
  facturaCon,
  matricula,
  series,
}: {
  facturaCon?: unknown
  matricula?: unknown
  series?: unknown
}): FacturapiAccount | null => {
  const explicit = upper(facturaCon)
  if (explicit === 'IEDIS' || explicit === 'IECS' || explicit === 'SILVIA') return explicit

  const normalizedSeries = upper(series)
  if (normalizedSeries) return IECS_SERIES.has(normalizedSeries) ? 'IECS' : 'IEDIS'

  const prefix = upper(matricula).slice(0, 2)
  if (prefix) return IEDIS_PREFIXES.has(prefix) ? 'IEDIS' : 'IECS'
  return null
}

const parseProviderError = async (response: Response) => {
  const raw = await response.text().catch(() => '')
  let payload: any = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null
  const message = text(
    payload?.message
    || payload?.error
    || firstError?.message
    || raw
    || `Facturapi respondió HTTP ${response.status}`,
  )
  return { payload, message }
}

const providerCall = async (
  account: FacturapiAccount,
  path: string,
  options: ProviderCallOptions = {},
): Promise<any> => {
  const method = upper(options.method || 'GET') || 'GET'
  const testMode = Boolean(options.testMode)
  const params = new URLSearchParams()
  Object.entries(options.query || {}).forEach(([name, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(name, String(item)))
      return
    }
    params.set(name, String(value))
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  const url = `${FACTURAPI_BASE_URL}/${path.replace(/^\/+/, '')}${params.size ? `?${params}` : ''}`

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${keyFor(account, testMode)}`,
      Accept: options.download ? '*/*' : 'application/json',
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const { payload, message } = await parseProviderError(response)
      throw createError({
        statusCode: response.status,
        statusMessage: response.status >= 500 ? 'Facturapi no disponible' : 'Facturapi rechazó la solicitud',
        message,
        data: {
          providerStatus: response.status,
          providerCode: text(payload?.code) || undefined,
          providerPath: text(payload?.path) || undefined,
        },
      })
    }

    if (options.download) return response
    if (response.status === 204) return { ok: true }
    const responseText = await response.text()
    return responseText ? JSON.parse(responseText) : { ok: true }
  } catch (error: any) {
    if (error?.statusCode) throw error
    if (error?.name === 'AbortError') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Facturapi tardó demasiado',
        message: 'Facturapi no respondió dentro de 60 segundos.',
      })
    }
    throw createError({
      statusCode: 502,
      statusMessage: 'No se pudo comunicar con Facturapi',
      message: text(error?.message) || 'Falló la comunicación directa con Facturapi.',
    })
  } finally {
    clearTimeout(timeout)
  }
}

const resolveInvoiceAccount = async ({
  invoiceId,
  facturaCon,
  matricula,
  series,
  testMode = false,
}: {
  invoiceId?: unknown
  facturaCon?: unknown
  matricula?: unknown
  series?: unknown
  testMode?: boolean
}): Promise<FacturapiAccount> => {
  const hinted = accountFromHints({ facturaCon, matricula, series })
  // Never fall through to another tenant when the caller already identifies the emitter.
  // If its key is missing, keyFor() will surface the exact missing environment variable.
  if (hinted) return hinted

  const normalizedMatricula = text(matricula)
  if (normalizedMatricula) {
    try {
      const [profile] = await query<any[]>(
        `SELECT factura_con FROM company_data WHERE matricula = ? LIMIT 1`,
        [normalizedMatricula],
      )
      const profileAccount = accountFromHints({ facturaCon: profile?.factura_con, matricula: normalizedMatricula })
      if (profileAccount && configuredAccounts(testMode).includes(profileAccount)) return profileAccount
    } catch (error) {
      console.warn('[Facturapi] No se pudo resolver la cuenta desde company_data:', error)
    }
  }

  const id = text(invoiceId)
  if (id) {
    try {
      const [stored] = await query<any[]>(
        `SELECT f.matricula, f.series, c.factura_con
         FROM facturas f
         LEFT JOIN company_data c ON c.matricula = f.matricula
         WHERE f.provider_invoice_id = ?
         ORDER BY f.id DESC
         LIMIT 1`,
        [id],
      )
      const storedAccount = accountFromHints({
        facturaCon: stored?.factura_con,
        matricula: stored?.matricula,
        series: stored?.series,
      })
      if (storedAccount && configuredAccounts(testMode).includes(storedAccount)) return storedAccount
    } catch (error) {
      console.warn('[Facturapi] No se pudo resolver la cuenta desde el índice local:', error)
    }
  }

  const available = configuredAccounts(testMode)
  if (id && available.length > 1) {
    for (const account of available) {
      try {
        await providerCall(account, `invoices/${encodeURIComponent(id)}`, { method: 'GET', testMode })
        return account
      } catch (error: any) {
        const status = Number(error?.statusCode || error?.status || 0)
        if (status === 404) continue
        // A provider outage/authentication error should not be misreported as an
        // ambiguous emitter. Surface it rather than probing the remaining tenants.
        throw error
      }
    }
  }
  if (available.length === 1) return available[0]
  if (hinted) return hinted
  throw createError({
    statusCode: 500,
    statusMessage: 'No se pudo resolver el emisor CFDI',
    message: 'Aurora no pudo determinar qué cuenta de Facturapi corresponde a esta factura.',
  })
}

const ensuredSeries = new Set<string>()

const ensureSeries = async (
  account: FacturapiAccount,
  series: unknown,
  nextFolio: unknown,
  testMode = false,
) => {
  const name = upper(series)
  if (!name || testMode) return
  const cacheKey = `${account}:${name}`
  if (ensuredSeries.has(cacheKey)) return

  const response = await providerCall(account, 'organizations/me/series-group', { method: 'GET' })
  const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
  if (rows.some((row: any) => upper(row?.series) === name)) {
    ensuredSeries.add(cacheKey)
    return
  }

  const requested = Number(nextFolio)
  const initial = Number.isInteger(requested) && requested > 0 ? requested : 1
  try {
    await providerCall(account, 'organizations/me/series-group', {
      method: 'POST',
      body: { series: name, next_folio: initial, next_folio_test: initial },
    })
  } catch (error: any) {
    // Two concurrent invoices can discover the same missing series. Re-read once
    // before surfacing the creation error so a harmless race does not block billing.
    const retry = await providerCall(account, 'organizations/me/series-group', { method: 'GET' }).catch(() => null)
    const retryRows = Array.isArray(retry?.data) ? retry.data : Array.isArray(retry) ? retry : []
    if (!retryRows.some((row: any) => upper(row?.series) === name)) throw error
  }
  ensuredSeries.add(cacheKey)
}

const normalizeInvoicePayload = (body: any) => {
  const source = body?.invoiceData && typeof body.invoiceData === 'object' ? body.invoiceData : body || {}
  const invoiceData: any = { ...source }
  const customer = invoiceData?.customer && typeof invoiceData.customer === 'object'
    ? { ...invoiceData.customer }
    : invoiceData.customer
  const matricula = text(customer?.matricula || body?.matricula || body?.companyData?.matricula)
  const facturaCon = invoiceData.facturaCon || invoiceData.factura_con || body?.facturaCon || body?.factura_con
  const testMode = bool(invoiceData.test_mode ?? body?.test_mode)

  delete invoiceData.facturaCon
  delete invoiceData.factura_con
  delete invoiceData.test_mode
  if (customer && typeof customer === 'object') {
    delete customer.matricula
    invoiceData.customer = customer
  }

  return { invoiceData, facturaCon, matricula, testMode }
}

const persistCompanyData = async (body: any, matricula: string, facturaCon: unknown) => {
  const companyData = body?.companyData
  if (!companyData || !matricula) return

  const requiredFields = [
    'legal_name', 'tax_id', 'email', 'tax_system', 'zip',
    'nombreCompleto', 'CURP', 'nivelEducativo', 'autRVOE',
  ]
  const missing = requiredFields.find((field) => !text(companyData?.[field]))
  if (missing) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos fiscales incompletos',
      message: `El campo '${missing}' en companyData es requerido.`,
    })
  }

  await query(
    `INSERT INTO company_data (
       matricula, legal_name, tax_id, tax_system, email, zip,
       nombreAlumno, CURP, nivelEducativo, autRVOE, factura_con
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       legal_name = VALUES(legal_name),
       tax_id = VALUES(tax_id),
       tax_system = VALUES(tax_system),
       email = VALUES(email),
       zip = VALUES(zip),
       nombreAlumno = VALUES(nombreAlumno),
       CURP = VALUES(CURP),
       nivelEducativo = VALUES(nivelEducativo),
       autRVOE = VALUES(autRVOE),
       factura_con = VALUES(factura_con),
       updated_at = CURRENT_TIMESTAMP`,
    [
      matricula,
      text(companyData.legal_name),
      upper(companyData.tax_id),
      text(companyData.tax_system),
      text(companyData.email),
      text(companyData.zip),
      text(companyData.nombreCompleto),
      upper(companyData.CURP),
      text(companyData.nivelEducativo),
      text(companyData.autRVOE),
      upper(facturaCon) || null,
    ],
  )
}

const resolveSeries = (body: any, invoiceData: any, matricula: string, facturaCon: unknown) => {
  const requested = upper(invoiceData?.series)
  const isSaveCompanyFlow = Boolean(body?.companyData && body?.invoiceData)

  let series = requested
  if (isSaveCompanyFlow) {
    if (requested) {
      if (!upper(matricula).startsWith('PT')) {
        throw createError({
          statusCode: 400,
          message: 'No se puede seleccionar una serie cuando la matrícula no comienza con "PT".',
        })
      }
      if (!['PT', 'ST'].includes(requested)) {
        throw createError({ statusCode: 400, message: 'Serie inválida. Debe ser "PT" o "ST".' })
      }
    } else {
      series = upper(matricula).slice(0, 2)
    }
    if (series === 'DM' && upper(facturaCon) === 'IECS') series = 'CM'
  } else if (!series && matricula) {
    series = upper(matricula).slice(0, 2)
  }

  if (!series) {
    throw createError({ statusCode: 400, message: 'No se pudo determinar la serie de la factura.' })
  }
  return series
}

const createInvoice = async (body: any) => {
  const { invoiceData, facturaCon, matricula, testMode } = normalizeInvoicePayload(body)
  const series = resolveSeries(body, invoiceData, matricula, facturaCon)
  invoiceData.series = series

  const requiredInvoiceFields = body?.companyData && body?.invoiceData
    ? ['customer', 'items', 'payment_form', 'use']
    : ['customer', 'items', 'use']
  const missingInvoiceField = requiredInvoiceFields.find((field) => !invoiceData?.[field])
  if (missingInvoiceField) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos de factura incompletos',
      message: `El campo '${missingInvoiceField}' en invoiceData es requerido.`,
    })
  }

  const account = await resolveInvoiceAccount({
    facturaCon,
    matricula,
    series,
    testMode,
  })

  await persistCompanyData(body, matricula, account)
  await ensureSeries(account, series, invoiceData?.folio_number || body?.companyData?.folio_number, testMode)

  if (SUCURSAL_MAP[series]) {
    invoiceData.pdf_custom_section = `<div>Sucursal: ${SUCURSAL_MAP[series]}</div>`
  }

  const invoice = await providerCall(account, 'invoices', {
    method: 'POST',
    body: invoiceData,
    testMode,
  })
  const responseSeries = text(invoice?.series || series)
  const folioNumber = invoice?.folio_number ?? invoiceData?.folio_number ?? null
  const folio = text(invoice?.folio) || `${responseSeries}${folioNumber ?? ''}`

  return {
    success: true,
    invoice_id: text(invoice?.id),
    series: responseSeries,
    folio_number: folioNumber,
    folio,
    facturaCon: account,
    factura: invoice,
  }
}

const localCompanyData = async (matricula: unknown) => {
  const normalized = text(matricula)
  if (!normalized) return { success: true, data: null }

  try {
    const [profile] = await query<any[]>(
      `SELECT matricula, legal_name, tax_id, tax_system, email, zip,
              nombreAlumno, CURP, nivelEducativo, autRVOE, factura_con
       FROM company_data
       WHERE matricula = ?
       LIMIT 1`,
      [normalized],
    )
    if (profile) return { success: true, data: profile }
  } catch (error) {
    console.warn('[Facturapi] No se pudo leer company_data; se usará el historial local:', error)
  }

  const [row] = await query<any[]>(
    `SELECT razonSocial, rfc, correo, regimenFiscal, cp
     FROM facturas
     WHERE UPPER(TRIM(CAST(matricula AS CHAR))) = ?
     ORDER BY COALESCE(issued_at, fecha) DESC, id DESC
     LIMIT 1`,
    [upper(normalized)],
  )
  if (!row) return { success: true, data: null }
  return {
    success: true,
    data: {
      legal_name: text(row.razonSocial),
      tax_id: upper(row.rfc),
      email: text(row.correo),
      tax_system: text(row.regimenFiscal),
      zip: text(row.cp),
    },
  }
}

const invoiceCancelLabel = (invoice: any) => {
  const status = text(invoice?.status).toLowerCase()
  const cancellation = text(invoice?.cancellation_status || 'none').toLowerCase()
  if (status === 'canceled' || cancellation === 'accepted') return 'Cancelada'
  if (cancellation === 'pending') return 'Cancelación pendiente'
  if (cancellation === 'rejected') return 'Cancelación rechazada'
  if (status === 'valid' && cancellation === 'none') return 'Vigente'
  return cancellation || status || 'Desconocido'
}

const dateInRange = (value: unknown, from: unknown, to: unknown) => {
  const timestamp = Date.parse(text(value))
  if (!Number.isFinite(timestamp)) return !from && !to
  const fromTime = from ? Date.parse(`${text(from)}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY
  const toTime = to ? Date.parse(`${text(to)}T23:59:59.999Z`) : Number.POSITIVE_INFINITY
  return timestamp >= fromTime && timestamp <= toTime
}

const listInvoices = async (queryParams: Record<string, any>) => {
  const testMode = bool(queryParams.test_mode)
  const requestedAccount = accountFromHints({
    facturaCon: queryParams.facturaCon || queryParams.factura_con,
    matricula: queryParams.matricula,
    series: queryParams.series,
  })
  const requestedTaxId = upper(queryParams.tax_id)
  const requestedSeries = upper(queryParams.series)
  const requestedSearch = text(queryParams.q).toLowerCase()
  const requestedStatus = text(queryParams.status).toLowerCase()
  const requestedCancellation = text(queryParams.cancel_status || queryParams.cancellation_status).toLowerCase()
  const page = Math.max(1, Number.parseInt(text(queryParams.page) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(text(queryParams.limit) || '50', 10) || 50))

  let companyRows: any[] = []
  if (requestedTaxId) {
    try {
      companyRows = await query<any[]>(
        `SELECT DISTINCT matricula, factura_con
         FROM company_data
         WHERE UPPER(TRIM(tax_id)) = ?`,
        [requestedTaxId],
      )
    } catch (error) {
      console.warn('[Facturapi] No se pudo cargar company_data para el listado:', error)
    }
  }

  const candidates = new Map<FacturapiAccount, string[]>()
  companyRows.forEach((row) => {
    const account = accountFromHints({ facturaCon: row?.factura_con, matricula: row?.matricula })
    if (!account) return
    const matriculas = candidates.get(account) || []
    const matricula = text(row?.matricula)
    if (matricula && !matriculas.includes(matricula)) matriculas.push(matricula)
    candidates.set(account, matriculas)
  })

  let accounts: FacturapiAccount[]
  if (requestedAccount) {
    accounts = [requestedAccount]
  } else if (candidates.size) {
    accounts = Array.from(candidates.keys())
  } else {
    accounts = configuredAccounts(testMode)
  }
  if (!accounts.length) keyFor('IEDIS', testMode)

  const collected: any[] = []
  for (const account of accounts) {
    // Facturapi caps list pages; over-fetch a bounded recent window per emitter and
    // merge/paginate in Aurora so IECS + IEDIS behave like the legacy aggregate API.
    const providerQuery: Record<string, unknown> = {
      type: 'I',
      page: 1,
      limit: 100,
    }
    if (requestedTaxId) providerQuery.q = requestedTaxId
    else if (requestedSearch) providerQuery.q = requestedSearch
    if (requestedSeries) providerQuery.series = requestedSeries

    const response = await providerCall(account, 'invoices', { query: providerQuery, testMode })
    const rows = Array.isArray(response?.data) ? response.data : []
    const fallbackMatricula = candidates.get(account)?.[0] || text(queryParams.matricula)

    rows.forEach((invoice: any) => {
      collected.push({
        ...invoice,
        facturaCon: account,
        fallbackMatricula,
      })
    })
  }

  const unique = new Map<string, any>()
  collected.forEach((invoice) => {
    const id = text(invoice?.id)
    if (id && !unique.has(id)) unique.set(id, invoice)
  })

  const providerIds = Array.from(unique.keys())
  const localByProvider = new Map<string, any>()
  if (providerIds.length) {
    try {
      const localRows = await query<any[]>(
        `SELECT provider_invoice_id, matricula, rfc, correo
         FROM facturas
         WHERE provider_invoice_id IN (?)`,
        [providerIds],
      )
      localRows.forEach((row) => localByProvider.set(text(row?.provider_invoice_id), row))
    } catch (error) {
      console.warn('[Facturapi] No se pudo enriquecer el listado con el índice local:', error)
    }
  }

  const normalized = Array.from(unique.values()).map((invoice: any) => {
    const id = text(invoice?.id)
    const local = localByProvider.get(id)
    const series = text(invoice?.series)
    const folioNumber = invoice?.folio_number ?? ''
    const customer = invoice?.customer || {}
    return {
      id,
      invoice_id: id,
      series,
      folio_number: folioNumber,
      folio: text(invoice?.folio) || `${series}${folioNumber}`,
      created_at: invoice?.created_at || invoice?.date || null,
      status: text(invoice?.status),
      cancellation_status: text(invoice?.cancellation_status || 'none'),
      payment_form: text(invoice?.payment_form),
      currency: text(invoice?.currency || 'MXN'),
      total: invoice?.total ?? null,
      customer_tax_id: upper(customer?.tax_id || customer?.rfc || local?.rfc),
      customer_name: text(customer?.legal_name || customer?.name),
      customer_email: text(customer?.email || local?.correo),
      uuid: text(invoice?.uuid),
      matricula: text(local?.matricula || invoice?.matricula || invoice?.fallbackMatricula),
      factura_con: invoice?.facturaCon,
      cancel_status_label: invoiceCancelLabel(invoice),
    }
  }).filter((invoice) => {
    if (requestedTaxId && invoice.customer_tax_id && invoice.customer_tax_id !== requestedTaxId) return false
    if (requestedSeries && upper(invoice.series) !== requestedSeries) return false
    if (requestedStatus) {
      if (requestedStatus === 'canceled') {
        if (!(text(invoice.status).toLowerCase() === 'canceled' || text(invoice.cancellation_status).toLowerCase() === 'accepted')) return false
      } else if (text(invoice.status).toLowerCase() !== requestedStatus) return false
    }
    if (requestedCancellation && text(invoice.cancellation_status).toLowerCase() !== requestedCancellation) return false
    if (!dateInRange(invoice.created_at, queryParams.date_from, queryParams.date_to)) return false
    if (requestedSearch && !requestedTaxId) {
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
  normalized.sort((a, b) => {
    if (sortBy === 'folio') {
      return direction * String(a.folio || '').localeCompare(String(b.folio || ''), 'es', { numeric: true })
    }
    if (sortBy === 'status') {
      return direction * String(a.cancel_status_label || '').localeCompare(String(b.cancel_status_label || ''), 'es')
    }
    const aDate = Date.parse(text(a.created_at)) || 0
    const bDate = Date.parse(text(b.created_at)) || 0
    return direction * (aDate - bDate)
  })

  const total = normalized.length
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
    invoices: normalized.slice(offset, offset + limit),
  }
}

const downloadInvoice = async (event: any, invoiceId: string, format: string, hints: any) => {
  const normalizedFormat = text(format).toLowerCase()
  if (!['pdf', 'xml', 'zip'].includes(normalizedFormat)) {
    throw createError({ statusCode: 400, message: 'Formato de descarga inválido.' })
  }
  const account = await resolveInvoiceAccount({ invoiceId, ...hints })
  const response = await providerCall(account, `invoices/${encodeURIComponent(invoiceId)}/${normalizedFormat}`, {
    method: 'GET',
    download: true,
    testMode: Boolean(hints.testMode),
  }) as Response
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const disposition = response.headers.get('content-disposition') || `attachment; filename="factura-${invoiceId}.${normalizedFormat}"`
  setHeader(event, 'content-type', contentType)
  setHeader(event, 'content-disposition', disposition)
  setHeader(event, 'cache-control', 'private, no-store')
  return Buffer.from(await response.arrayBuffer())
}

const cancelInvoice = async (invoiceId: string, body: any, queryParams: Record<string, any>) => {
  const testMode = bool(body?.test_mode ?? queryParams.test_mode)
  const account = await resolveInvoiceAccount({
    invoiceId,
    facturaCon: body?.facturaCon || body?.factura_con || queryParams.facturaCon || queryParams.factura_con,
    matricula: body?.matricula || queryParams.matricula,
    series: body?.series || queryParams.series,
    testMode,
  })
  const motive = text(body?.motive || queryParams.motive || '03')
  const substitution = text(body?.substitution || body?.substitution_folio || queryParams.substitution)
  const providerQuery: Record<string, unknown> = { motive }
  if (substitution) providerQuery.substitution = substitution
  const invoice = await providerCall(account, `invoices/${encodeURIComponent(invoiceId)}`, {
    method: 'DELETE',
    query: providerQuery,
    testMode,
  })
  return { success: true, ...invoice, factura: invoice }
}

export const proxyCfdiEvent = async (event: any, targetPath: string, options: { body?: unknown } = {}) => {
  if (!targetPath) throw createError({ statusCode: 400, message: 'Ruta CFDI requerida' })

  const method = upper(event.node.req.method || 'GET') || 'GET'
  const queryParams = getQuery(event) as Record<string, any>
  const body = method !== 'GET' && method !== 'HEAD'
    ? (Object.prototype.hasOwnProperty.call(options, 'body') ? options.body : await readBody(event))
    : undefined

  if (targetPath === 'getCompanyData' && method === 'GET') {
    return localCompanyData(queryParams.matricula)
  }

  if (targetPath === 'saveCompanyAndGenerate' && method === 'POST') {
    return createInvoice(body)
  }

  if (targetPath === 'createInvoice' && method === 'POST') {
    return createInvoice(body)
  }

  if (targetPath === 'sendInvoiceEmail' && method === 'POST') {
    const invoiceId = text((body as any)?.invoice_id || (body as any)?.id)
    if (!invoiceId) throw createError({ statusCode: 400, message: 'invoice_id es requerido.' })
    const testMode = bool((body as any)?.test_mode)
    const account = await resolveInvoiceAccount({
      invoiceId,
      facturaCon: (body as any)?.facturaCon || (body as any)?.factura_con,
      matricula: (body as any)?.matricula,
      series: (body as any)?.series,
      testMode,
    })
    const email = text((body as any)?.email)
    const response = await providerCall(account, `invoices/${encodeURIComponent(invoiceId)}/email`, {
      method: 'POST',
      body: email ? { email } : {},
      testMode,
    })
    return { success: true, ...response }
  }

  const downloadMatch = targetPath.match(/^downloadInvoice\/([^/]+)\/(pdf|xml|zip)$/i)
  if (downloadMatch && method === 'GET') {
    return downloadInvoice(event, decodeURIComponent(downloadMatch[1]), downloadMatch[2], {
      facturaCon: queryParams.facturaCon || queryParams.factura_con,
      matricula: queryParams.matricula,
      series: queryParams.series,
      testMode: bool(queryParams.test_mode),
    })
  }

  if (targetPath === 'invoices' && method === 'GET') {
    return listInvoices(queryParams)
  }

  if (targetPath === 'invoices' && method === 'POST') {
    return createInvoice(body)
  }

  const cancelMatch = targetPath.match(/^invoices\/([^/]+)\/cancel$/i)
  if (cancelMatch && method === 'POST') {
    return cancelInvoice(decodeURIComponent(cancelMatch[1]), body, queryParams)
  }

  const invoiceMatch = targetPath.match(/^invoices\/([^/]+)$/i)
  if (invoiceMatch && method === 'GET') {
    const invoiceId = decodeURIComponent(invoiceMatch[1])
    const testMode = bool(queryParams.test_mode)
    const account = await resolveInvoiceAccount({
      invoiceId,
      facturaCon: queryParams.facturaCon || queryParams.factura_con,
      matricula: queryParams.matricula,
      series: queryParams.series,
      testMode,
    })
    return providerCall(account, `invoices/${encodeURIComponent(invoiceId)}`, { testMode })
  }

  throw createError({
    statusCode: 404,
    statusMessage: 'Ruta CFDI no soportada',
    message: `La ruta ${targetPath} ya no se delega al servicio factura-api.`,
  })
}
