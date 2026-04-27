import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const { inicio, fin, plantel, ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  if (user.role !== 'global') {
     throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este reporte.' })
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

  const rows = await query<any[]>(`
    SELECT
      DATE(r.fecha) as fecha,
      r.formaDePago,
      r.conceptoNombre as categoria,
      r.folio,
      r.monto,
      A.grado as gradoBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as plantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio ASC
  `, params)

  const grouped = new Map<string, any>()

  rows
    .filter(row => !isOutOfScopeForPlantelCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey))
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
})
