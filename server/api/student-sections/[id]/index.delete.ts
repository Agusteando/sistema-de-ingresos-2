import { executeStatementTransaction, query, type SqlStatement } from '../../../utils/db'

const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = Number(event.context.params?.id)

  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Seccion invalida.' })
  }

  const params: any[] = [id]
  let scopeSql = ''
  if (isScopedToActivePlantel(user)) {
    scopeSql = ' AND plantel = ?'
    params.push(user.active_plantel)
  }

  const [section] = await query<any[]>(`
    SELECT id FROM student_custom_sections
    WHERE id = ?${scopeSql}
    LIMIT 1
  `, params)

  if (!section) {
    throw createError({ statusCode: 404, message: 'Seccion no encontrada.' })
  }

  const statements: SqlStatement[] = [
    { sql: 'DELETE FROM student_custom_section_memberships WHERE section_id = ?', params: [id] },
    { sql: 'UPDATE student_custom_sections SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', params: [id] }
  ]

  await executeStatementTransaction(statements)
  return { success: true }
})
