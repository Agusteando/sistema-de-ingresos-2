export default defineEventHandler(async (event) => {
  const path = event.context.params?.path
  const query = getQuery(event)
  const method = event.node.req.method
  const body = method !== 'GET' ? await readBody(event) : undefined

  const qStr = new URLSearchParams(query as any).toString()
  const url = `https://update.casitaapps.com/api/${path}${qStr ? '?' + qStr : ''}`

  try {
    const response = await $fetch(url, {
      method,
      body: body ? body : undefined
    })
    return response
  } catch (err: any) {
    throw createError({
      statusCode: err?.response?.status || 500,
      message: err?.data?.error || err.message || 'Error en comunicación con proveedor CFDI'
    })
  }
})