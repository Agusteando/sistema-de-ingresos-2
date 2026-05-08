import { executeStatementTransaction, query, type SqlStatement } from '../../../utils/db'

const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')
const normalizeMatricula = (value: unknown) => String(value || '').trim()
const normalizeMatriculas = (value: unknown) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map(normalizeMatricula)
    .filter(Boolean)
)).slice(0, 1000)

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const body = await readBody(event)
  const matriculas = normalizeMatriculas(body.matriculas)
  const sectionId = Number(body.sectionId)
  const action = String(body.action || '').trim().toLowerCase()

  if (!matriculas.length) {
    throw createError({ statusCode: 400, message: 'Seleccion de alumnos requerida.' })
  }

  if (!Number.isFinite(sectionId) || sectionId <= 0) {
    throw createError({ statusCode: 400, message: 'Seccion invalida.' })
  }

  if (!['add', 'remove'].includes(action)) {
    throw createError({ statusCode: 400, message: 'Accion invalida.' })
  }

  const sectionParams: any[] = [sectionId]
  let sectionScope = ''
  if (isScopedToActivePlantel(user)) {
    sectionScope = ' AND plantel = ?'
    sectionParams.push(user.active_plantel)
  }

  const [section] = await query<any[]>(`
    SELECT id, name, plantel, color
    FROM student_custom_sections
    WHERE id = ? AND is_active = 1${sectionScope}
    LIMIT 1
  `, sectionParams)

  if (!section) {
    throw createError({ statusCode: 404, message: 'Seccion no encontrada.' })
  }

  const placeholders = matriculas.map(() => '?').join(',')
  const studentParams: any[] = [...matriculas]
  let studentScope = ''
  if (isScopedToActivePlantel(user)) {
    studentScope = ' AND plantel = ?'
    studentParams.push(user.active_plantel)
  }

  const scopedStudents = await query<any[]>(`
    SELECT matricula
    FROM base
    WHERE matricula IN (${placeholders})${studentScope}
  `, studentParams)

  const allowedMatriculas = scopedStudents.map((student) => normalizeMatricula(student.matricula)).filter(Boolean)
  if (!allowedMatriculas.length) {
    throw createError({ statusCode: 404, message: 'No hay alumnos validos en la seleccion.' })
  }

  const statements: SqlStatement[] = []
  if (action === 'remove') {
    statements.push({
      sql: `DELETE FROM student_custom_section_memberships WHERE section_id = ? AND matricula IN (${allowedMatriculas.map(() => '?').join(',')})`,
      params: [sectionId, ...allowedMatriculas]
    })
  } else {
    allowedMatriculas.forEach((matricula) => {
      statements.push({
        sql: `
          INSERT INTO student_custom_section_memberships (section_id, matricula, created_by)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)
        `,
        params: [sectionId, matricula, user.name || user.email || null]
      })
    })
  }

  if (statements.length) await executeStatementTransaction(statements)

  return {
    success: true,
    matriculas: allowedMatriculas,
    section: {
      id: Number(section.id),
      name: section.name,
      plantel: section.plantel,
      color: section.color
    }
  }
})
