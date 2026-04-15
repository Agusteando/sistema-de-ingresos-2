import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const rows = await query<any[]>(`SELECT * FROM base WHERE matricula = ?`, [matricula])
  
  if (rows[0]) {
    return {
      ...rows[0],
      padre: rows[0]['Nombre del padre o tutor'] || '',
      birth: rows[0]['Fecha de nacimiento'] || ''
    }
  }
  
  return null
})