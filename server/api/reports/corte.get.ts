import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo, plantelCandidatesForProjectedScope } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { inicio, fin, plantel, ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  if (!user.isSuperAdmin) {
     throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este reporte.' })
  }
  
  let where = "r.estatus = 'Vigente' AND COALESCE(r.depurado, 0) = 0 AND r.ciclo = ?"
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

  const rows = await query<any[]>(`
    SELECT
      DATE(r.fecha) as fecha,
      r.formaDePago,
      r.conceptoNombre as categoria,
      r.folio,
      r.monto,
      A.grado as gradoBase,
      A.nivel as nivelBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as plantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio ASC
  `, params)

  const grouped = new Map<string, any>()

  rows
    .filter(row => isInProjectedPlantelScopeForCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey, row.nivelBase, scopePlantel || 'GLOBAL'))
    .forEach((row) => {
      const fecha = row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : String(row.fecha).slice(0, 10)
      const key = `${fecha}|${row.formaDePago}|${row.categoria}`
      const current = grouped.get(key) || {
        fecha,
        formaDePago: row.formaDePago,
        categoria: row.categoria,
        transacciones: 0,
        total: 0
      }

      current.transacciones += 1
      current.total += Number(row.monto || 0)
      grouped.set(key, current)
    })

  return Array.from(grouped.values())
    .sort((a, b) => {
      const dateDiff = new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      return dateDiff || Number(b.total || 0) - Number(a.total || 0)
    })
}))
