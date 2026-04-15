import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const [student] = await query<any[]>(`SELECT \`Nombre del padre o tutor\` as padre, familiaId FROM base WHERE matricula = ?`, [matricula])
  
  if (!student) return []
  
  let siblings = []

  if (student.familiaId) {
    siblings = await query<any[]>(`
      SELECT matricula, nombreCompleto, nivel, grado, grupo 
      FROM base 
      WHERE familiaId = ? AND matricula != ? AND estatus = 'Activo'
    `, [student.familiaId, matricula])
  } else if (student.padre) {
    siblings = await query<any[]>(`
      SELECT matricula, nombreCompleto, nivel, grado, grupo 
      FROM base 
      WHERE \`Nombre del padre o tutor\` = ? AND matricula != ? AND estatus = 'Activo'
    `, [student.padre, matricula])
  }
  
  return siblings
})