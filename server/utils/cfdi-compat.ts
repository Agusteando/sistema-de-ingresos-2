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

  // Production CFDI operations must preserve the contract that was proven before
  // the native migration. Do not mix native and legacy semantics per request: a
  // successful-but-different native response cannot safely trigger a fallback and
  // mutations such as create/cancel/email must never be attempted twice.
  return legacyCfdiRequest(event, targetPath, body)
}
