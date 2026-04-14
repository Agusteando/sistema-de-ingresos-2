import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { inicio, fin, plantel, ciclo = '2024' } = getQuery(event)
  
  let where = "r.estatus = 'Vigente' AND r.ciclo = ?"
  const params: any[] = [ciclo]

  if (inicio && fin) {
    where += " AND DATE(r.fecha) BETWEEN ? AND ?"
    params.push(inicio, fin)
  }
  if (plantel) {
    where += " AND b.plantel = ?"
    params.push(plantel)
  }

  const sql = `
    SELECT 
      DATE(r.fecha) as fecha, r.formaDePago, c.concepto as categoria, 
      COUNT(r.folio) as transacciones, SUM(r.monto) as total
    FROM referenciasdepago r
    LEFT JOIN base b ON r.matricula = b.matricula
    LEFT JOIN documentos d ON r.documento = d.documento
    LEFT JOIN conceptos c ON d.conceptoId = c.id
    WHERE ${where}
    GROUP BY DATE(r.fecha), r.formaDePago, c.concepto
    ORDER BY fecha DESC, total DESC
  `
  return await query(sql, params)
})