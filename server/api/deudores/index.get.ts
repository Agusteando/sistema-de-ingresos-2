import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { calculatePromotedGrado, displayGrado, nivelFromPlantel } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  let whereClause = "A.estatus = 'Activo'"
  const params: any[] = [cicloKey, cicloKey]

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    whereClause += " AND A.plantel = ?"
    params.push(user.active_plantel)
  }

  const sql = `
    SELECT 
      A.matricula, A.nombreCompleto, A.grado as gradoBase, A.grupo, A.ciclo as cicloBase, A.plantel, A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre,
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
      WHERE ciclo = ? AND estatus = 'Activo'
      GROUP BY matricula
    ) C ON A.matricula = C.matricula
    WHERE ${whereClause}
    HAVING deudaVigente > 0
    ORDER BY deudaVigente DESC, A.nombreCompleto ASC
  `
  
  const deudores = await query<any[]>(sql, params)
  return deudores.map((row) => {
    const promoted = calculatePromotedGrado(row.gradoBase, row.plantel, row.cicloBase, cicloKey)
    return {
      ...row,
      grado: displayGrado(promoted.grado),
      nivel: promoted.egresado ? promoted.nivel : nivelFromPlantel(row.plantel)
    }
  })
})
