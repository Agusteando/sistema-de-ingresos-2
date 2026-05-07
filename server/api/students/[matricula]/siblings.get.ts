import { query } from '../../../utils/db'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../../shared/utils/grado'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const isReliableEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
const isScopedToActivePlantel = (user: any) => user?.role !== 'global' || (user?.role === 'global' && user?.active_plantel !== 'GLOBAL')

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user

  const [student] = await query<any[]>(`
    SELECT B.correo, F.family_key AS familyKey
    FROM base B
    LEFT JOIN student_family_links F ON F.matricula = B.matricula
    WHERE B.matricula = ?
    LIMIT 1
  `, [matricula])

  if (!student) return { siblings: [], source: 'none', familyKey: null }

  let siblings: any[] = []
  let source = 'none'

  if (student.familyKey) {
    siblings = await query<any[]>(`
      SELECT B.matricula, B.nombreCompleto, B.plantel, B.grado, B.grupo, B.ciclo
      FROM student_family_links F
      JOIN base B ON B.matricula = F.matricula
      WHERE F.family_key = ? AND B.matricula != ? AND B.estatus = 'Activo'
    `, [student.familyKey, matricula])

    siblings = siblings.filter((sibling) => {
      if (isScopedToActivePlantel(user) && String(sibling.plantel || '') !== String(user.active_plantel || '')) return false
      return !isOutOfScopeForPlantelCiclo(sibling.grado, sibling.plantel, sibling.ciclo, cicloKey)
    })

    source = 'local'
  } else if (isReliableEmail(student.correo)) {
    const correo = normalizeEmail(student.correo)

    siblings = await query<any[]>(`
      SELECT matricula, nombreCompleto, plantel, grado, grupo, ciclo
      FROM base
      WHERE LOWER(TRIM(correo)) = ? AND matricula != ? AND estatus = 'Activo'
    `, [correo, matricula])

    siblings = siblings.filter((sibling) => {
      if (isScopedToActivePlantel(user) && String(sibling.plantel || '') !== String(user.active_plantel || '')) return false
      return !isOutOfScopeForPlantelCiclo(sibling.grado, sibling.plantel, sibling.ciclo, cicloKey)
    })

    source = siblings.length ? 'email' : 'none'
  }

  // Actionable sibling links come from student_family_links; email fallback is exact and validated.
  // Parent/tutor names and display names are never used to infer siblings.
  return {
    siblings,
    source,
    familyKey: student.familyKey || null
  }
})
