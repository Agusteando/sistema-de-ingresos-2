const FACTURAPI_ORIGIN = 'https://www.facturapi.io'
const READ_RETRY_DELAYS_MS = [250, 750]
const READ_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const INSTALL_MARKER = Symbol.for('aurora.facturapi.resilient-fetch')

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const requestUrl = (input: any) => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return String(input?.url || '')
}

const requestMethod = (input: any, init: any = {}) => String(
  init?.method || input?.method || 'GET'
).trim().toUpperCase() || 'GET'

const transportContext = (error: any) => {
  const cause = error?.cause || {}
  return {
    error: String(error?.message || '').slice(0, 240) || undefined,
    cause: String(cause?.message || '').slice(0, 240) || undefined,
    code: String(cause?.code || error?.code || '').slice(0, 80) || undefined,
    errno: cause?.errno ?? error?.errno ?? undefined,
    syscall: String(cause?.syscall || error?.syscall || '').slice(0, 80) || undefined,
    hostname: String(cause?.hostname || error?.hostname || '').slice(0, 160) || undefined,
    address: String(cause?.address || error?.address || '').slice(0, 160) || undefined,
    port: cause?.port ?? error?.port ?? undefined,
  }
}

export default defineNitroPlugin(() => {
  const runtime = globalThis as any
  if (runtime[INSTALL_MARKER]) return

  const baseFetch = globalThis.fetch.bind(globalThis)
  runtime[INSTALL_MARKER] = true

  runtime.fetch = async (input: any, init: any = {}) => {
    const url = requestUrl(input)
    if (!url.startsWith(FACTURAPI_ORIGIN)) return baseFetch(input, init)

    const method = requestMethod(input, init)
    const isRead = method === 'GET' || method === 'HEAD'
    const maxAttempts = isRead ? READ_RETRY_DELAYS_MS.length + 1 : 1

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await baseFetch(input, init)
        const retryableStatus = isRead
          && READ_RETRY_STATUSES.has(response.status)
          && attempt < maxAttempts
          && !init?.signal?.aborted

        if (!retryableStatus) return response

        console.warn('[CFDI] Lectura transitoria de Facturapi; reintentando', {
          method,
          url: new URL(url).pathname,
          status: response.status,
          attempt,
          nextAttempt: attempt + 1,
        })
        await response.body?.cancel().catch(() => undefined)
        await sleep(READ_RETRY_DELAYS_MS[attempt - 1])
      } catch (error: any) {
        const diagnostic = transportContext(error)
        const canRetry = isRead
          && attempt < maxAttempts
          && !init?.signal?.aborted

        if (!canRetry) {
          console.error('[CFDI] Fallo de transporte con Facturapi', {
            method,
            url: new URL(url).pathname,
            attempt,
            ...diagnostic,
          })
          throw error
        }

        console.warn('[CFDI] Lectura de Facturapi sin respuesta; reintentando', {
          method,
          url: new URL(url).pathname,
          attempt,
          nextAttempt: attempt + 1,
          ...diagnostic,
        })
        await sleep(READ_RETRY_DELAYS_MS[attempt - 1])
      }
    }

    return baseFetch(input, init)
  }
})
