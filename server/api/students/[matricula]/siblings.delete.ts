import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const [student] = await query<any[]>(`SELECT familiaId FROM base WHERE matricula = ?`, [matricula])

  if (!student?.familiaId) {
    return { success: true, cleared: 0 }
  }

  const result = await query<any>(
    `UPDATE base SET familiaId = NULL WHERE familiaId = ?`,
    [student.familiaId]
  )

  return {
    success: true,
    cleared: Number(result?.affectedRows || 0)
  }
})
