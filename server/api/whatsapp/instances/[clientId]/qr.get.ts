import { query } from '../../../../utils/db'
import { whatsappApi } from '../../../../utils/whatsapp'

const getQrBody = (payload: any) => payload?.qr || payload || {}

const shouldRefreshQr = (payload: any) => {
  const qr = getQrBody(payload)
  const status = String(qr.status || payload?.status || '').toLowerCase()

  if (qr.sessionReady) return false
  if (qr.qrAvailable === false) return true
  return ['expired', 'error', 'timeout', 'qr_expired'].includes(status)
}

const persistQrState = async (clientId: string, payload: any) => {
  const qr = getQrBody(payload)
  const status = qr.sessionReady ? 'ready' : (qr.status || payload?.status || 'pending')

  await query(
    `UPDATE cobranza_whatsapp_clients
     SET status = ?, metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.lastQrStatus', ?, '$.lastQrAt', CAST(NOW() AS CHAR)), updated_at = NOW()
     WHERE client_id = ?`,
    [String(status), JSON.stringify(qr), clientId]
  )
}

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId requerido' })

  const { refresh = '1', force = '0' } = getQuery(event)
  const normalizedClientId = String(clientId)
  let refreshed = false

  if (String(force) === '1') {
    await whatsappApi.reconnect(normalizedClientId)
    refreshed = true
  }

  try {
    let payload = await whatsappApi.getQr(normalizedClientId)

    if (String(refresh) === '1' && shouldRefreshQr(payload)) {
      await whatsappApi.reconnect(normalizedClientId)
      payload = await whatsappApi.getQr(normalizedClientId)
      refreshed = true
    }

    await persistQrState(normalizedClientId, payload)
    return { ...payload, refreshed }
  } catch (error: any) {
    const message = String(error?.statusMessage || error?.message || '').toLowerCase()
    if (String(refresh) === '1' && !refreshed && (message.includes('expired') || message.includes('qr'))) {
      await whatsappApi.reconnect(normalizedClientId)
      const payload = await whatsappApi.getQr(normalizedClientId)
      await persistQrState(normalizedClientId, payload)
      return { ...payload, refreshed: true }
    }

    throw error
  }
})
