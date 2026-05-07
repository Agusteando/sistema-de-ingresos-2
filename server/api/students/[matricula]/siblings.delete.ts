import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const user = event.context.user

  const [student] = await query<any[]>(`
    SELECT B.plantel, F.family_key AS familyKey
    FROM base B
    LEFT JOIN student_family_links F ON F.matricula = B.matricula
    WHERE B.matricula = ?
    LIMIT 1
  `, [matricula])

  if (!student?.familyKey) {
    return { success: true, cleared: 0 }
  }

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(student.plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
    }
  }

  const result = await query<any>(
    `DELETE FROM student_family_links WHERE family_key = ?`,
    [student.familyKey]
  )

  return {
    success: true,
    cleared: Number(result?.affectedRows || 0)
  }
})
