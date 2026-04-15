import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { inicio, fin, plantel, ciclo = '2024' } = getQuery(event)
  const user = event.context.user
  
  if (user.role !== 'global') {
     throw createError({ statusCode: 403, message: 'No tiene permisos para realizar esta operación.' })
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

  const rows = await query(`
    SELECT r.folio, r.fecha, r.matricula, r.documento, r.mes, r.nombreCompleto, r.conceptoNombre, r.monto, r.formaDePago, r.plantel, r.instituto
    FROM referenciasdepago r
    WHERE ${where}
    ORDER BY r.folio ASC
  `, params)

  const totales = await query(`
    SELECT r.formaDePago, SUM(r.monto) as total
    FROM referenciasdepago r
    WHERE ${where}
    GROUP BY r.formaDePago
  `, params)

  return { rows, totales }
})