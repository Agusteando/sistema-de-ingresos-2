const WHATSAPP_BASE_URL = (process.env.WWEB_BASE_URL || 'https://wweb.casitaapps.com/whatsapp-manager/integration/v1').replace(/\/+$/, '')
const WHATSAPP_PUBLIC_BASE_URL = (process.env.WWEB_PUBLIC_BASE_URL || 'https://wweb.casitaapps.com/whatsapp-manager/api').replace(/\/+$/, '')

type RequestOptions = {
  method?: string
  endpoint: string
  body?: any
  idempotencyKey?: string
  contentType?: string
  baseUrl?: string
}

const request = async <T>(options: RequestOptions): Promise<T> => {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {}

  if (!isFormData) {
    headers['Content-Type'] = options.contentType || 'application/json'
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }

  const response = await fetch(`${options.baseUrl || WHATSAPP_BASE_URL}${options.endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body == null
      ? undefined
      : isFormData
        ? options.body
        : (options.contentType === 'application/json' || !options.contentType)
          ? JSON.stringify(options.body)
          : options.body
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const firstFailure = Array.isArray(payload?.failures)
      ? payload.failures.find((item: any) => typeof item?.error === 'string' && item.error.trim())?.error
      : null
    const message = firstFailure || payload?.error?.message || payload?.error || payload?.message || `Error HTTP ${response.status}`
    throw createError({ statusCode: response.status, statusMessage: String(message) })
  }

  return payload as T
}

const withSafeSendOptions = (payload: any) => ({
  ...payload,
  options: {
    ...(payload?.options && typeof payload.options === 'object' ? payload.options : {}),
    sendSeen: false
  }
})

const buildMediaForm = (payload: { chatIds: string[]; caption?: string; file: Buffer; filename: string; mimetype: string }) => {
  const form = new FormData()
  form.append('chatId', JSON.stringify(payload.chatIds))
  if (payload.caption) form.append('caption', payload.caption)
  form.append('file', new Blob([new Uint8Array(payload.file)], { type: payload.mimetype }), payload.filename)
  return form
}

export const whatsappApi = {
  createInstance: (clientId: string, displayName: string) => request<any>({
    method: 'POST',
    endpoint: '/instances',
    idempotencyKey: clientId,
    body: {
      clientId,
      displayName,
      metadata: { source: 'sistema-de-ingresos' }
    }
  }),
  listInstances: () => request<any>({ endpoint: '/instances' }),
  getInstance: (clientId: string) => request<any>({ endpoint: `/instances/${encodeURIComponent(clientId)}` }),
  getQr: (clientId: string) => request<any>({ endpoint: `/instances/${encodeURIComponent(clientId)}/qr` }),
  getStatus: (clientId: string) => request<any>({ endpoint: `/instances/${encodeURIComponent(clientId)}/status` }),
  reconnect: (clientId: string) => request<any>({ method: 'POST', endpoint: `/instances/${encodeURIComponent(clientId)}/reconnect` }),
  updateConfiguration: (clientId: string, configuration: any) => request<any>({
    method: 'PATCH',
    endpoint: `/instances/${encodeURIComponent(clientId)}/configuration`,
    body: configuration
  }),
  sendMessage: (clientId: string, payload: any, idempotencyKey: string) => request<any>({
    method: 'POST',
    endpoint: `/instances/${encodeURIComponent(clientId)}/messages`,
    idempotencyKey,
    body: withSafeSendOptions(payload)
  }),
  sendMedia: (clientId: string, payload: { chatIds: string[]; caption?: string; file: Buffer; filename: string; mimetype: string }, idempotencyKey: string) => request<any>({
    method: 'POST',
    endpoint: `/instances/${encodeURIComponent(clientId)}/messages`,
    idempotencyKey,
    body: buildMediaForm(payload)
  }),
  sendPublicMessage: (payload: any, idempotencyKey: string) => request<any>({
    method: 'POST',
    endpoint: '/send',
    baseUrl: WHATSAPP_PUBLIC_BASE_URL,
    idempotencyKey,
    body: withSafeSendOptions(payload)
  }),
  sendPublicMedia: (payload: { chatIds: string[]; caption?: string; file: Buffer; filename: string; mimetype: string }, idempotencyKey: string) => request<any>({
    method: 'POST',
    endpoint: '/send-media',
    baseUrl: WHATSAPP_PUBLIC_BASE_URL,
    idempotencyKey,
    body: buildMediaForm(payload)
  })
}
