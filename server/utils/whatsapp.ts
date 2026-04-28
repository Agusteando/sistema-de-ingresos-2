const WHATSAPP_BASE_URL = 'https://wweb.casitaapps.com/whatsapp-manager/integration/v1'

type RequestOptions = {
  method?: string
  clientId?: string
  endpoint: string
  body?: any
  idempotencyKey?: string
  contentType?: string
}

const request = async <T>(options: RequestOptions): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': options.contentType || 'application/json'
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }

  const response = await fetch(`${WHATSAPP_BASE_URL}${options.endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body == null
      ? undefined
      : (options.contentType === 'application/json' || !options.contentType)
        ? JSON.stringify(options.body)
        : options.body
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Error HTTP ${response.status}`
    throw createError({ statusCode: response.status, statusMessage: message })
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
  })
}
