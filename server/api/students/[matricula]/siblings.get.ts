import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const [student] = await query<any[]>(`SELECT familiaId FROM base WHERE matricula = ?`, [matricula])
  
  if (!student) return { siblings: [], source: 'none', familiaId: null }
  
  let siblings = []

  if (student.familiaId) {
    siblings = await query<any[]>(`
      SELECT matricula, nombreCompleto, plantel, grado, grupo 
      FROM base 
      WHERE familiaId = ? AND matricula != ? AND estatus = 'Activo'
    `, [student.familiaId, matricula])
  }
  
  // familiaId is the only local authority for actionable sibling links.
  // Parent/tutor names from external payloads remain audit data in external_base_sync.last_payload.
  return {
    siblings,
    source: student.familiaId ? 'local' : 'none',
    familiaId: student.familiaId || null
  }
})
