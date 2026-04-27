import { query } from '../../../utils/db'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../../shared/utils/grado'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const isReliableEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  const [student] = await query<any[]>(`SELECT familiaId, correo FROM base WHERE matricula = ?`, [matricula])
  
  if (!student) return { siblings: [], source: 'none', familiaId: null }
  
  let siblings = []
  let source = 'none'

  if (student.familiaId) {
    siblings = await query<any[]>(`
      SELECT matricula, nombreCompleto, plantel, grado, grupo, ciclo
      FROM base 
      WHERE familiaId = ? AND matricula != ? AND estatus = 'Activo'
    `, [student.familiaId, matricula])

    siblings = siblings.filter((sibling) => {
      if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
        if (String(sibling.plantel || '') !== String(user.active_plantel || '')) return false
      }

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
      if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
        if (String(sibling.plantel || '') !== String(user.active_plantel || '')) return false
      }

      return !isOutOfScopeForPlantelCiclo(sibling.grado, sibling.plantel, sibling.ciclo, cicloKey)
    })

    source = siblings.length ? 'email' : 'none'
  }
  
  // Actionable sibling links come from familiaId; email fallback is exact and validated.
  // Parent/tutor names and display names are never used to infer siblings.
  return {
    siblings,
    source,
    familiaId: student.familiaId || null
  }
})
