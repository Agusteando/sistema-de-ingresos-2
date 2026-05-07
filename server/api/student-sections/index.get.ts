import { query } from '../../utils/db'

const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const where: string[] = ['S.is_active = 1']
  const params: any[] = []

  if (isScopedToActivePlantel(user)) {
    where.push('S.plantel = ?')
    params.push(user.active_plantel)
  }

  const rows = await query<any[]>(`
    SELECT
      S.id,
      S.name,
      S.plantel,
      S.description,
      S.color,
      S.sort_order AS sortOrder,
      COUNT(M.id) AS studentCount
    FROM student_custom_sections S
    LEFT JOIN student_custom_section_memberships M ON M.section_id = S.id
    WHERE ${where.join(' AND ')}
    GROUP BY S.id, S.name, S.plantel, S.description, S.color, S.sort_order
    ORDER BY S.sort_order ASC, S.name ASC
  `, params)

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    studentCount: Number(row.studentCount || 0)
  }))
})
