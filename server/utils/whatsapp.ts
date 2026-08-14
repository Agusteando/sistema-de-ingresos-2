const WHATSAPP_BASE_URL = (process.env.WWEB_BASE_URL || 'https://wweb.casitaapps.com/whatsapp-manager/integration/v1').replace(/\/+$/, '')

type RequestOptions = {
  method?: string
  endpoint: string
  body?: any
  idempotencyKey?: string
  contentType?: string
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

  const response = await fetch(`${WHATSAPP_BASE_URL}${options.endpoint}`, {
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
    const message = payload?.error?.message || payload?.error || payload?.message || `Error HTTP ${response.status}`
    throw createError({ statusCode: response.status, statusMessage: String(message) })
  }

  return payload as T
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
    body: payload
  }),
  sendMedia: (clientId: string, payload: { chatIds: string[]; caption?: string; file: Buffer; filename: string; mimetype: string }, idempotencyKey: string) => {
    const form = new FormData()
    form.append('chatId', JSON.stringify(payload.chatIds))
    if (payload.caption) form.append('caption', payload.caption)
    form.append('file', new Blob([new Uint8Array(payload.file)], { type: payload.mimetype }), payload.filename)

    return request<any>({
      method: 'POST',
      endpoint: `/instances/${encodeURIComponent(clientId)}/messages`,
      idempotencyKey,
      body: form
    })
  }
}
