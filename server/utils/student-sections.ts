import { canonicalizeStudentGroups } from '../../shared/utils/group'
import { query } from './db'

export const isScopedToActivePlantel = (user: any) => !user?.isSuperAdmin || (user?.isSuperAdmin && user?.active_plantel !== 'GLOBAL')

export const attachCustomSectionsToStudents = async <T extends Record<string, any>>(students: T[], user: any): Promise<Array<T & { customSections: any[] }>> => {
  const canonicalStudents = canonicalizeStudentGroups(students)
  if (!canonicalStudents.length) return canonicalStudents.map((student) => ({ ...student, customSections: [] }))

  const matriculas = Array.from(new Set(canonicalStudents.map((student) => String(student.matricula || '').trim()).filter(Boolean)))
  if (!matriculas.length) return canonicalStudents.map((student) => ({ ...student, customSections: [] }))

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

  return canonicalStudents.map((student) => ({
    ...student,
    customSections: byMatricula.get(String(student.matricula || '').trim()) || []
  }))
}

const normalizeSectionMatricula = (value: unknown) => String(value || '').trim().toUpperCase()
const normalizeSectionPlantel = (value: unknown) => String(value || '').trim().toUpperCase()

export const studentSectionLabel = (sections: any[] = []) => sections
  .map((section) => String(section?.name || '').trim())
  .filter(Boolean)
  .join(' / ')

export const attachSectionLabelsToRows = async <T extends Record<string, any>>(
  rows: T[] = [],
  options: { plantel?: unknown } = {}
): Promise<Array<T & { seccion: string }>> => {
  if (!rows.length) return []

  const matriculas = Array.from(new Set(
    rows.map((row) => normalizeSectionMatricula(row?.matricula)).filter(Boolean)
  ))
  if (!matriculas.length) return rows.map((row) => ({ ...row, seccion: '' }))

  const requestedPlantel = normalizeSectionPlantel(options.plantel)
  const membershipsByMatricula = new Map<string, any[]>()

  try {
    const chunkSize = 400
    for (let index = 0; index < matriculas.length; index += chunkSize) {
      const chunk = matriculas.slice(index, index + chunkSize)
      const params: any[] = [...chunk]
      const scopeSql = requestedPlantel ? ' AND UPPER(TRIM(S.plantel)) = ?' : ''
      if (requestedPlantel) params.push(requestedPlantel)

      const memberships = await query<any[]>(`
        SELECT
          M.matricula,
          S.id,
          S.name,
          S.plantel,
          S.color,
          S.sort_order
        FROM student_custom_section_memberships M
        JOIN student_custom_sections S ON S.id = M.section_id
        WHERE UPPER(TRIM(M.matricula)) IN (${chunk.map(() => '?').join(',')})
          AND S.is_active = 1
          ${scopeSql}
        ORDER BY S.sort_order ASC, S.name ASC
      `, params)

      memberships.forEach((membership) => {
        const key = normalizeSectionMatricula(membership?.matricula)
        if (!key) return
        const list = membershipsByMatricula.get(key) || []
        list.push({
          id: Number(membership.id),
          name: membership.name,
          plantel: membership.plantel,
          color: membership.color,
          sortOrder: Number(membership.sort_order || 0)
        })
        membershipsByMatricula.set(key, list)
      })
    }
  } catch (error: any) {
    console.warn('[Report Sections] Active section lookup unavailable.', {
      plantel: requestedPlantel || 'row-scope',
      students: matriculas.length,
      message: error?.message || error
    })
    return rows.map((row) => ({ ...row, seccion: '' }))
  }

  return rows.map((row) => {
    const matricula = normalizeSectionMatricula(row?.matricula)
    const rowPlantel = requestedPlantel || normalizeSectionPlantel(
      row?.scopePlantel || row?.plantel || row?.basePlantel || row?.plantelBase
    )
    const memberships = membershipsByMatricula.get(matricula) || []
    const scopedMemberships = rowPlantel
      ? memberships.filter((membership) => normalizeSectionPlantel(membership?.plantel) === rowPlantel)
      : memberships

    return {
      ...row,
      seccion: studentSectionLabel(scopedMemberships)
    }
  })
}

