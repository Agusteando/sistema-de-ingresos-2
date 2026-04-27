import { query } from '../../../utils/db'
import { nivelFromPlantel } from '../../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const rows = await query<any[]>(`
    SELECT
      A.*,
      Prev.previous_matricula AS matriculaAnterior,
      Next.successor_matricula AS matriculaSiguiente
    FROM base A
    LEFT JOIN alumno_matricula_links Prev ON Prev.successor_matricula = A.matricula
    LEFT JOIN alumno_matricula_links Next ON Next.previous_matricula = A.matricula
    WHERE A.matricula = ?
    LIMIT 1
  `, [matricula])
  
  if (rows[0]) {
    return {
      ...rows[0],
      nivel: nivelFromPlantel(rows[0].plantel),
      padre: rows[0]['Nombre del padre o tutor'] || '',
      birth: rows[0]['Fecha de nacimiento'] || ''
    }
  }
  
  return null
})
