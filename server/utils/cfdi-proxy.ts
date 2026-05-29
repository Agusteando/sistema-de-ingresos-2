const CFDI_BASE_URL = 'https://update.casitaapps.com/api'

export const resolveCfdiPath = (pathParam: unknown) => Array.isArray(pathParam)
  ? pathParam.join('/')
  : String(pathParam || '')

const sanitizeQuery = (query: Record<string, any>) => {
  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach(item => params.append(key, String(item)))
      return
    }
    params.append(key, String(value))
  })
  return params.toString()
}

export const proxyCfdiEvent = async (event: any, targetPath: string) => {
  if (!targetPath) throw createError({ statusCode: 400, message: 'Ruta CFDI requerida' })

  const method = (event.node.req.method || 'GET').toUpperCase()
  const queryString = sanitizeQuery(getQuery(event) as Record<string, any>)
  const url = `${CFDI_BASE_URL}/${targetPath}${queryString ? `?${queryString}` : ''}`
  const body = method !== 'GET' && method !== 'HEAD' ? await readBody(event) : undefined
  const isDownload = /^downloadInvoice\//i.test(targetPath)

  try {
    if (isDownload) {
      const response = await $fetch.raw<ArrayBuffer>(url, {
        method: method as any,
        body: body || undefined,
        responseType: 'arrayBuffer'
      })

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const disposition = response.headers.get('content-disposition')
      setHeader(event, 'content-type', contentType)
      if (disposition) setHeader(event, 'content-disposition', disposition)
      return Buffer.from(response._data || new ArrayBuffer(0))
    }

    return await $fetch(url, {
      method: method as any,
      body: body || undefined
    })
  } catch (err: any) {
    throw createError({
      statusCode: err?.response?.status || err?.statusCode || 500,
      message: err?.data?.error || err?.data?.message || err.message || 'Error en comunicación con proveedor CFDI'
    })
  }
}
