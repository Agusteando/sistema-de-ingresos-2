import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { inicio, fin, plantel, ciclo = '2025' } = getQuery(event)
  const user = event.context.user
  
  if (user.role !== 'global') {
     throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este reporte.' })
  }
  
  let where = "r.estatus = 'Vigente' AND r.ciclo = ?"
  const params: any[] = [ciclo]

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

  const sql = `
    SELECT 
      DATE(r.fecha) as fecha, r.formaDePago, r.conceptoNombre as categoria, 
      COUNT(r.folio) as transacciones, SUM(r.monto) as total
    FROM referenciasdepago r
    WHERE ${where}
    GROUP BY DATE(r.fecha), r.formaDePago, r.conceptoNombre
    ORDER BY fecha DESC, total DESC
  `
  return await query(sql, params)
})