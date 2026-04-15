import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { q = '', ciclo = '2024' } = getQuery(event)
  const user = event.context.user
  
  let whereClause = "A.estatus = 'Activo'"
  const params: any[] = []

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    whereClause += " AND A.plantel = ?"
    params.push(user.active_plantel)
  }

  if (q) {
    whereClause += " AND (A.nombreCompleto LIKE ? OR A.matricula = ?)"
    params.push(`%${q}%`, q)
  }

  const sql = `
    SELECT 
      A.matricula, A.nombreCompleto, A.grado, A.grupo, A.nivel, A.plantel, A.estatus, A.correo,
      IFNULL(B.pagosTotal, 0) AS pagosTotal,
      IFNULL(C.saldo, 0) AS importeTotal,
      (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto,
      IF(A.ciclo = ?, 0, 1) as interno
    FROM base A
    LEFT JOIN (
      SELECT matricula, SUM(monto) AS pagosTotal
      FROM referenciasdepago
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) B ON A.matricula = B.matricula
    LEFT JOIN (
      SELECT matricula, SUM(((100 - IFNULL(beca, 0)) * costo / 100) * IFNULL(meses, 1)) AS saldo
      FROM documentos
      WHERE ciclo = ?
      GROUP BY matricula
    ) C ON A.matricula = C.matricula
    WHERE ${whereClause}
    ORDER BY A.nombreCompleto ASC
    LIMIT 100;
  `
  
  const queryParams = [ciclo, ciclo, ciclo, ...params]
  const students = await query(sql, queryParams)
  
  return students
})