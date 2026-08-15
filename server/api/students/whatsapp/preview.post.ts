import { runWithBridgeAgentId, query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'
import { resolveStudentWhatsappAudience } from '../../../utils/studentWhatsapp'

const extractStatus = (payload: any) => payload?.instance?.status || payload?.status?.status || payload?.status || 'pending'
const isMissingInstanceError = (error: any) => Number(error?.statusCode || error?.status || 0) === 404
  || /does not exist|instance not found|no encontrada|not found/i.test(String(error?.statusMessage || error?.message || ''))

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const body = await readBody(event)
  const transport = String(body?.transport || 'public').toLowerCase() === 'qr' ? 'qr' : 'public'
  const contactSource = String(body?.contactSource || 'lookup').toLowerCase() === 'selection' ? 'selection' : 'lookup'
  const audience = await resolveStudentWhatsappAudience(body?.matriculas, user, {
    contactSource,
    students: body?.students
  })

  if (transport === 'public') {
    return {
      transport,
      recipients: audience.recipients,
      groups: audience.groups.map((group) => ({
        matriculas: group.matriculas,
        names: group.names,
        phoneMasked: group.phoneMasked,
      })),
      summary: audience.summary,
      session: {
        clientId: '',
        displayName: '',
        status: 'public',
        ready: false,
        missingRemote: false
      }
    }
  }

  return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const [client] = await query<any[]>(
      `SELECT client_id, status, display_name FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1`,
      [user.email]
    )

    let status = String(client?.status || 'disconnected')
    let clientId = String(client?.client_id || '')
    let displayName = String(client?.display_name || '')
    let missingRemote = false

    if (clientId) {
      try {
        const remote = await whatsappApi.getStatus(clientId)
        status = String(extractStatus(remote))
        await query(`UPDATE cobranza_whatsapp_clients SET status = ?, updated_at = NOW() WHERE client_id = ?`, [status, clientId])
      } catch (error) {
        if (isMissingInstanceError(error)) {
          missingRemote = true
          await query(`DELETE FROM cobranza_whatsapp_clients WHERE client_id = ? AND user_email = ?`, [clientId, user.email])
          clientId = ''
          displayName = ''
          status = 'disconnected'
        } else {
          status = 'pending'
        }
      }
    }

    return {
      transport,
      recipients: audience.recipients,
      groups: audience.groups.map((group) => ({
        matriculas: group.matriculas,
        names: group.names,
        phoneMasked: group.phoneMasked,
      })),
      summary: audience.summary,
      session: clientId ? {
        clientId,
        displayName,
        status,
        ready: status.toLowerCase() === 'ready',
        missingRemote
      } : {
        clientId: '',
        displayName: '',
        status: 'disconnected',
        ready: false,
        missingRemote
      }
    }
  })
})
