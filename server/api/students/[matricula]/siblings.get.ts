import { query } from '../../../utils/db'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  const [student] = await query<any[]>(`SELECT familiaId FROM base WHERE matricula = ?`, [matricula])
  
  if (!student) return { siblings: [], source: 'none', familiaId: null }
  
  let siblings = []

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
  }
  
  // familiaId is the only local authority for actionable sibling links.
  // Parent/tutor names from external payloads remain audit data in external_base_sync.last_payload.
  return {
    siblings,
    source: student.familiaId ? 'local' : 'none',
    familiaId: student.familiaId || null
  }
})
