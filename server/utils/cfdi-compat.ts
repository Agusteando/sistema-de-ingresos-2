import { proxyCfdiEvent } from './cfdi-proxy'

const LEGACY_CFDI_BASE_URL = String(
  process.env.CFDI_LEGACY_BASE_URL || 'https://update.casitaapps.com/api',
).replace(/\/+$/, '')

const text = (value: unknown) => String(value ?? '').trim()

const sanitizeQuery = (query: Record<string, any>) => {
  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)))
      return
    }
    params.append(key, String(value))
  })
  return params.toString()
}

const missingDirectKey = (error: any) => {
  const detail = [
    error?.message,
    error?.statusMessage,
    error?.data?.message,
    error?.data?.providerMessage,
  ].map(text).filter(Boolean).join(' ')
  const match = detail.match(/Falta FACTURAPI_(LIVE|TEST)_KEY_(IEDIS|IECS|SILVIA)/i)
  return match ? {
    mode: String(match[1] || '').toUpperCase(),
    account: String(match[2] || '').toUpperCase(),
  } : null
}

const explicitCreationAccount = (body: any) => {
  const raw = text(
    body?.invoiceData?.facturaCon
    || body?.invoiceData?.factura_con
    || body?.facturaCon
    || body?.factura_con,
  ).toUpperCase()
  return ['IEDIS', 'IECS', 'SILVIA'].includes(raw) ? raw : ''
}

const bool = (value: unknown) => value === true
  || ['1', 'true', 'yes', 'si', 'sí'].includes(text(value).toLowerCase())

const missingExplicitCreationKey = (targetPath: string, body: any) => {
  if (!/^(?:saveCompanyAndGenerate|createInvoice)$/i.test(targetPath)) return null
  const account = explicitCreationAccount(body)
  if (!account) return null
  const testMode = bool(body?.invoiceData?.test_mode ?? body?.test_mode)
  const mode = testMode ? 'TEST' : 'LIVE'
  const envName = `FACTURAPI_${mode}_KEY_${account}`
  return text(process.env[envName]) ? null : { mode, account, envName }
}

const legacyCfdiRequest = async (event: any, targetPath: string, body: unknown) => {
  const method = String(event.node.req.method || 'GET').toUpperCase()
  const queryString = sanitizeQuery(getQuery(event) as Record<string, any>)
  const url = `${LEGACY_CFDI_BASE_URL}/${targetPath}${queryString ? `?${queryString}` : ''}`
  const isDownload = /^downloadInvoice\//i.test(targetPath)

  try {
    if (isDownload) {
      const response = await $fetch.raw<ArrayBuffer>(url, {
        method: method as any,
        body: body === undefined ? undefined : body,
        responseType: 'arrayBuffer',
        timeout: 60_000,
        retry: 0,
      })

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const disposition = response.headers.get('content-disposition')
      setHeader(event, 'content-type', contentType)
      if (disposition) setHeader(event, 'content-disposition', disposition)
      return Buffer.from(response._data || new ArrayBuffer(0))
    }

    return await $fetch(url, {
      method: method as any,
      body: body === undefined ? undefined : body,
      timeout: 60_000,
      retry: 0,
    })
  } catch (error: any) {
    const providerPayload = error?.data || error?.response?._data || {}
    const providerStatus = Number(error?.response?.status || error?.statusCode || error?.status || 500)
    const providerMessage = text(
      providerPayload?.error
      || providerPayload?.message
      || error?.statusMessage
      || error?.message
      || 'Error en comunicación con proveedor CFDI',
    )

    throw createError({
      statusCode: providerStatus,
      statusMessage: providerStatus >= 500 ? 'Proveedor CFDI no disponible' : 'Solicitud CFDI rechazada',
      message: providerMessage,
      data: {
        providerStatus,
        providerMessage,
        source: 'factura-api-compat',
      },
    })
  }
}

export const proxyCfdiCompatEvent = async (
  event: any,
  targetPath: string,
  options: { body?: unknown } = {},
) => {
  if (!targetPath) throw createError({ statusCode: 400, message: 'Ruta CFDI requerida' })

  const method = String(event.node.req.method || 'GET').toUpperCase()
  const hasExplicitBody = Object.prototype.hasOwnProperty.call(options, 'body')
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : (hasExplicitBody ? options.body : await readBody(event))

  const preflight = missingExplicitCreationKey(targetPath, body)
  if (preflight) {
    console.warn('[CFDI] Compatibilidad factura-api activada', {
      targetPath,
      reason: 'missing-direct-key',
      account: preflight.account,
      mode: preflight.mode,
    })
    return legacyCfdiRequest(event, targetPath, body)
  }

  try {
    return await proxyCfdiEvent(
      event,
      targetPath,
      method === 'GET' || method === 'HEAD' ? {} : { body },
    )
  } catch (error: any) {
    const missing = missingDirectKey(error)
    if (!missing) throw error

    console.warn('[CFDI] Compatibilidad factura-api activada', {
      targetPath,
      reason: 'missing-direct-key',
      account: missing.account,
      mode: missing.mode,
    })
    return legacyCfdiRequest(event, targetPath, body)
  }
}
