import { executeStatementTransaction, query, type SqlStatement } from '../../../utils/db'

const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')
const normalizeMatricula = (value: unknown) => String(value || '').trim()
const normalizeIds = (value: unknown) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
))

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const matricula = normalizeMatricula(event.context.params?.matricula)
  const body = await readBody(event)
  const requestedIds = normalizeIds(body.sectionIds)

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matricula requerida.' })
  }

  const studentParams: any[] = [matricula]
  let studentScope = ''
  if (isScopedToActivePlantel(user)) {
    studentScope = ' AND plantel = ?'
    studentParams.push(user.active_plantel)
  }

  const [student] = await query<any[]>(`
    SELECT matricula, plantel FROM base
    WHERE matricula = ?${studentScope}
    LIMIT 1
  `, studentParams)

  if (!student) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const sectionParams: any[] = []
  let sectionScope = 'is_active = 1'
  if (isScopedToActivePlantel(user)) {
    sectionScope += ' AND plantel = ?'
    sectionParams.push(user.active_plantel)
  }

  const allowedSections = await query<any[]>(`
    SELECT id, name, plantel, color
    FROM student_custom_sections
    WHERE ${sectionScope}
    ORDER BY sort_order ASC, name ASC
  `, sectionParams)

  const allowedIds = new Set(allowedSections.map((section) => Number(section.id)))
  const finalIds = requestedIds.filter((id) => allowedIds.has(id))

  const statements: SqlStatement[] = []
  if (allowedIds.size > 0) {
    const placeholders = Array.from(allowedIds).map(() => '?').join(',')
    statements.push({
      sql: `DELETE FROM student_custom_section_memberships WHERE matricula = ? AND section_id IN (${placeholders})`,
      params: [matricula, ...Array.from(allowedIds)]
    })
  }

  finalIds.forEach((sectionId) => {
    statements.push({
      sql: `
        INSERT INTO student_custom_section_memberships (section_id, matricula, created_by)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)
      `,
      params: [sectionId, matricula, user.name || user.email || null]
    })
  })

  if (statements.length) await executeStatementTransaction(statements)

  return {
    success: true,
    sections: allowedSections
      .filter((section) => finalIds.includes(Number(section.id)))
      .map((section) => ({
        id: Number(section.id),
        name: section.name,
        plantel: section.plantel,
        color: section.color
      }))
  }
})
