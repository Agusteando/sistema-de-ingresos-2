import { query } from '../../../utils/db'
import { whatsappApi } from '../../../utils/whatsapp'

export default defineEventHandler(async () => {
  const remote = await whatsappApi.listInstances()
  const local = await query<any[]>(`SELECT * FROM cobranza_whatsapp_clients ORDER BY updated_at DESC`)
  return { remote, local }
})
