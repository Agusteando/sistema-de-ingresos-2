import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo, plantelCandidatesForProjectedScope } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { inicio, fin, plantel, ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  if (!user.isSuperAdmin) {
     throw createError({ statusCode: 403, message: 'No tiene permisos para realizar esta operación.' })
  }
  
  let where = "r.estatus = 'Vigente' AND r.ciclo = ?"
  const params: any[] = [cicloKey]

  if (inicio && fin) {
    where += " AND DATE(r.fecha) BETWEEN ? AND ?"
    params.push(inicio, fin)
  }

  const scopePlantel = (!user.isSuperAdmin || user.active_plantel !== 'GLOBAL')
    ? user.active_plantel
    : plantel

  if (scopePlantel) {
    const plantelCandidates = plantelCandidatesForProjectedScope(scopePlantel)
    where += ` AND COALESCE(A.plantel, r.plantel) IN (${plantelCandidates.map(() => '?').join(',')})`
    params.push(...plantelCandidates)
  }

  const rawRows = await query<any[]>(`
    SELECT
      r.folio, r.fecha, r.matricula, r.documento, r.mes, r.nombreCompleto,
      r.conceptoNombre, r.monto, r.formaDePago, r.plantel, r.instituto,
      A.grado as gradoBase,
      A.nivel as nivelBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.folio ASC
  `, params)

  const rows = rawRows.filter(row => (
    isInProjectedPlantelScopeForCiclo(row.gradoBase, row.scopePlantel, row.cicloBase, cicloKey, row.nivelBase, scopePlantel || 'GLOBAL')
  ))

  const totalsMap = new Map<string, number>()
  rows.forEach((row) => {
    const key = String(row.formaDePago || '')
    totalsMap.set(key, (totalsMap.get(key) || 0) + Number(row.monto || 0))
  })

  const totales = Array.from(totalsMap.entries()).map(([formaDePago, total]) => ({
    formaDePago,
    total
  }))

  return { rows, totales }
}))
