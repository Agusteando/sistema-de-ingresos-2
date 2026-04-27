import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const { inicio, fin, plantel, ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  if (user.role !== 'global') {
     throw createError({ statusCode: 403, message: 'No tiene permisos para realizar esta operación.' })
  }
  
  let where = "r.estatus = 'Vigente' AND r.ciclo = ?"
  const params: any[] = [cicloKey]

  if (inicio && fin) {
    where += " AND DATE(r.fecha) BETWEEN ? AND ?"
    params.push(inicio, fin)
  }

  if (user.role !== 'global' || user.active_plantel !== 'GLOBAL') {
    where += " AND r.plantel = ?"
    params.push(user.active_plantel)
  } else if (plantel) {
    where += " AND r.plantel = ?"
    params.push(plantel)
  }

  const rawRows = await query<any[]>(`
    SELECT
      r.folio, r.fecha, r.matricula, r.documento, r.mes, r.nombreCompleto,
      r.conceptoNombre, r.monto, r.formaDePago, r.plantel, r.instituto,
      A.grado as gradoBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.folio ASC
  `, params)

  const rows = rawRows.filter(row => (
    !isOutOfScopeForPlantelCiclo(row.gradoBase, row.scopePlantel, row.cicloBase, cicloKey)
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
})
