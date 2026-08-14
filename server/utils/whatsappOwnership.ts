import { query } from './db'

export const assertWhatsappClientOwnership = async (clientId: string, user: any) => {
  const normalizedClientId = String(clientId || '').trim()
  const userEmail = String(user?.email || '').trim()
  if (!normalizedClientId || !userEmail) {
    throw createError({ statusCode: 404, statusMessage: 'Sesión de WhatsApp no encontrada.' })
  }

  const [client] = await query<any[]>(
    `SELECT client_id, status, display_name FROM cobranza_whatsapp_clients WHERE client_id = ? AND user_email = ? LIMIT 1`,
    [normalizedClientId, userEmail]
  )
  if (!client) {
    throw createError({ statusCode: 404, statusMessage: 'Sesión de WhatsApp no encontrada.' })
  }
  return client
}
