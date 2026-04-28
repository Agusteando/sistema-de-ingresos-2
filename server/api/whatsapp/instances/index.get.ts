import { query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'

export default defineEventHandler(async (event) => {
  const { remote = '0', mine = '1' } = getQuery(event)
  const user = event.context.user

  const local = mine === '0'
    ? await query<any[]>(`SELECT * FROM cobranza_whatsapp_clients ORDER BY updated_at DESC`)
    : await query<any[]>(`SELECT * FROM cobranza_whatsapp_clients WHERE user_email = ? ORDER BY updated_at DESC`, [user.email])

  if (String(remote) === '1') {
    return { remote: await whatsappApi.listInstances(), local }
  }

  return { local }
})
