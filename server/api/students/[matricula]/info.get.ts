import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const rows = await query<any[]>(`SELECT * FROM base WHERE matricula = ?`, [matricula])
  return rows[0] || null
})