import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { inicio, fin, plantel, ciclo = '2024' } = getQuery(event)
  const user = event.context.user
  
  // Strict RBAC limit: Local roles absolutely cannot generate financial consolidated reporting 
  if (user.role !== 'global') {
     throw createError({ statusCode: 403, message: 'Operación financiera denegada para este perfil' })
  }
  
  let where = "r.estatus = 'Vigente' AND r.ciclo = ?"
  const params: any[] = [ciclo]

  if (inicio && fin) {
    where += " AND DATE(r.fecha) BETWEEN ? AND ?"
    params.push(inicio, fin)
  }
  if (plantel) {
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