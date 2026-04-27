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
      SELECT cargos.matricula, SUM(cargos.monto) AS saldo
      FROM (
        SELECT
          D.matricula,
          ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100) AS monto
        FROM documentos D
        JOIN (
          SELECT 1 AS mes UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
          UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
        ) M ON M.mes <= GREATEST(1, CAST(IFNULL(NULLIF(D.meses, ''), '1') AS UNSIGNED))
        LEFT JOIN documento_concepto_periodos P
          ON P.documento = D.documento
          AND P.estatus = 'Activo'
          AND M.mes >= P.start_mes
          AND (P.end_mes IS NULL OR M.mes <= P.end_mes)
        WHERE D.ciclo = ? AND D.estatus = 'Activo' AND (P.accion IS NULL OR P.accion <> 'cancelacion')
      ) cargos
      GROUP BY cargos.matricula
    ) C ON A.matricula = C.matricula
    WHERE ${whereClause}
    HAVING deudaVigente > 0
    ORDER BY deudaVigente DESC, A.nombreCompleto ASC
  `
  
  const deudores = await query<any[]>(sql, params)
  return deudores.flatMap((row) => {
    const promoted = calculatePromotedGrado(row.gradoBase, row.plantel, row.cicloBase, cicloKey)
    if (promoted.outOfScope) return []

    return {
      ...row,
      grado: displayGrado(promoted.grado),
      nivel: promoted.egresado ? promoted.nivel : nivelFromPlantel(row.plantel)
    }
  })
})
