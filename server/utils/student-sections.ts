import { query } from './db'

export const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')

export const attachCustomSectionsToStudents = async <T extends Record<string, any>>(students: T[], user: any): Promise<Array<T & { customSections: any[] }>> => {
  if (!students.length) return students.map((student) => ({ ...student, customSections: [] }))

  const matriculas = Array.from(new Set(students.map((student) => String(student.matricula || '').trim()).filter(Boolean)))
  if (!matriculas.length) return students.map((student) => ({ ...student, customSections: [] }))

  const params: any[] = [...matriculas]
  let scopeSql = ''

  if (isScopedToActivePlantel(user)) {
    scopeSql = ' AND S.plantel = ?'
    params.push(user.active_plantel)
  }

  const memberships = await query<any[]>(`
    SELECT
      M.matricula,
      S.id,
      S.name,
      S.plantel,
      S.color
    FROM student_custom_section_memberships M
    JOIN student_custom_sections S ON S.id = M.section_id
    WHERE M.matricula IN (${matriculas.map(() => '?').join(',')})
      AND S.is_active = 1
      ${scopeSql}
    ORDER BY S.sort_order ASC, S.name ASC
  `, params)

  const byMatricula = new Map<string, any[]>()
  memberships.forEach((membership) => {
    const key = String(membership.matricula || '').trim()
    const list = byMatricula.get(key) || []
    list.push({
      id: Number(membership.id),
      name: membership.name,
      plantel: membership.plantel,
      color: membership.color
    })
    byMatricula.set(key, list)
  })

  return students.map((student) => ({
    ...student,
    customSections: byMatricula.get(String(student.matricula || '').trim()) || []
  }))
}
