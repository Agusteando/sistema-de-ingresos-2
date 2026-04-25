import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  if (!matricula) return { foto: null }

  try {
    const rows = await query<any[]>('SELECT last_payload FROM external_base_sync WHERE matricula = ? LIMIT 1', [matricula])
    if (rows && rows.length > 0 && rows[0].last_payload) {
      const payload = typeof rows[0].last_payload === 'string' ? JSON.parse(rows[0].last_payload) : rows[0].last_payload
      if (payload && payload.foto) {
        return { foto: payload.foto }
      }
    }
  } catch (e) {
    // Ignore error
  }
  return { foto: null }
})