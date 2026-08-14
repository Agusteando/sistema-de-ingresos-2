import { runWithBridgeAgentId, query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'
import { resolveStudentWhatsappAudience } from '../../../utils/studentWhatsapp'

const extractStatus = (payload: any) => payload?.instance?.status || payload?.status?.status || payload?.status || 'pending'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const body = await readBody(event)
  const audience = await resolveStudentWhatsappAudience(body?.matriculas, user)

  const [client] = await query<any[]>(
    `SELECT client_id, status, display_name FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1`,
    [user.email]
  )

  let status = String(client?.status || 'disconnected')
  if (client?.client_id) {
    try {
      const remote = await whatsappApi.getStatus(String(client.client_id))
      status = String(extractStatus(remote))
      await query(`UPDATE cobranza_whatsapp_clients SET status = ?, updated_at = NOW() WHERE client_id = ?`, [status, client.client_id])
    } catch (error) {
      status = String(client.status || 'pending')
    }
  }

  return {
    recipients: audience.recipients,
    summary: audience.summary,
    session: client?.client_id ? {
      clientId: client.client_id,
      displayName: client.display_name || '',
      status,
      ready: status.toLowerCase() === 'ready'
    } : {
      clientId: '',
      displayName: '',
      status: 'disconnected',
      ready: false
    }
  }
}))
