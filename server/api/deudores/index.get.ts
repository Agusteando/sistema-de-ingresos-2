import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { ciclo = '2024' } = getQuery(event)
  const user = event.context.user
  
  let whereClause = "A.estatus = 'Activo'"
  const params: any[] = [ciclo, ciclo]

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    whereClause += " AND A.plantel = ?"
    params.push(user.active_plantel)
  }

  const sql = `
    SELECT 
      A.matricula, A.nombreCompleto, A.grado, A.grupo, A.nivel, A.plantel, A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre,
      IFNULL(C.saldo, 0) AS importeTotal,
      IFNULL(B.pagosTotal, 0) AS pagosTotal,
      (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS deudaVigente
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
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) C ON A.matricula = C.matricula
    WHERE ${whereClause}
    HAVING deudaVigente > 0
    ORDER BY deudaVigente DESC, A.nombreCompleto ASC
  `
  
  const deudores = await query(sql, params)
  return deudores
})