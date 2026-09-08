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

const errorStatus = (error: any) => Number(
  error?.statusCode
  || error?.status
  || error?.response?.status
  || error?.data?.statusCode
  || error?.data?.status
  || 0,
)

const errorText = (error: any) => [
  error?.message,
  error?.statusMessage,
  error?.data?.message,
  error?.data?.providerMessage,
  error?.data?.diagnostic?.message,
  error?.data?.diagnostic?.code,
  error?.code,
].map(text).filter(Boolean).join(' ')

const isSafeLegacyFallback = (targetPath: string, error: any) => {
  const status = errorStatus(error)
  const detail = errorText(error)

  // The direct adapter has not contacted Facturapi when keyFor() throws.
  if (/Falta FACTURAPI_(?:LIVE|TEST)_KEY_(?:IEDIS|IECS|SILVIA)/i.test(detail)) return true

  // Authentication rejection cannot have emitted/cancelled/sent a CFDI.
  if (status === 401 && /Facturapi|autentic/i.test(detail)) return true

  // These local DB failures happen before the provider mutation in the save/create flow.
  if (/^(?:getCompanyData|saveCompanyAndGenerate|createInvoice)$/i.test(targetPath)) {
    if (/DB_BRIDGE_|DB bridge request failed|agent_mysql|ER_[A-Z0-9_]+/i.test(detail)) return true
  }

  // Preserve the pre-migration compatibility surface for routes not yet implemented directly.
  return status === 404 && /ya no se delega al servicio factura-api/i.test(detail)
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

  try {
    return await proxyCfdiEvent(
      event,
      targetPath,
      method === 'GET' || method === 'HEAD' ? {} : { body },
    )
  } catch (error: any) {
    if (!isSafeLegacyFallback(targetPath, error)) throw error
    console.warn(`[CFDI] Compatibilidad factura-api activada para ${targetPath}: ${errorText(error)}`)
    return legacyCfdiRequest(event, targetPath, body)
  }
}
