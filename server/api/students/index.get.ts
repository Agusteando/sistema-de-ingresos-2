import { query } from '../../utils/db'
import { calculatePromotedGrado, displayGrado } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const { q = '', ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  let whereClause = "1=1"
  const params: any[] = []

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    whereClause += " AND A.plantel = ?"
    params.push(user.active_plantel)
  }

  if (q) {
    whereClause += " AND (A.nombreCompleto LIKE ? OR A.matricula = ?)"
    params.push(`%${q}%`, q)
  } else {
    // If no search query, optimize by only loading active students OR inactive students touched in this cycle
    whereClause += " AND (A.estatus = 'Activo' OR A.ciclo = ?)"
    params.push(cicloKey)
  }

  const sql = `
    SELECT 
      A.matricula, A.nombreCompleto, A.apellidoPaterno, A.apellidoMaterno, A.nombres, A.genero,
      A.grado as gradoBase, A.grupo, A.ciclo as cicloBase, A.ciclo, A.plantel, A.estatus,
      A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre, A.\`Fecha de nacimiento\` as birth, A.interno as internoBase,
      Prev.previous_matricula AS matriculaAnterior,
      Next.successor_matricula AS matriculaSiguiente,
      IFNULL(B.pagosTotal, 0) AS pagosTotal,
      B.conceptosPagados,
      IFNULL(C.saldo, 0) AS importeTotal,
      C.conceptosCargados,
      (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto
    FROM base A
    LEFT JOIN (
      SELECT matricula, SUM(monto) AS pagosTotal, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') as conceptosPagados
      FROM referenciasdepago
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) B ON A.matricula = B.matricula
    LEFT JOIN (
      SELECT cargos.matricula, SUM(cargos.monto) AS saldo, GROUP_CONCAT(DISTINCT cargos.conceptoNombre SEPARATOR '|') as conceptosCargados
      FROM (
        SELECT
          D.matricula,
          ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100) AS monto,
          IFNULL(P.conceptoNombre, D.conceptoNombre) AS conceptoNombre
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
    LEFT JOIN alumno_matricula_links Prev ON Prev.successor_matricula = A.matricula
    LEFT JOIN alumno_matricula_links Next ON Next.previous_matricula = A.matricula
    WHERE ${whereClause}
    ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC
    LIMIT 5000;
  `
  
  const queryParams = [cicloKey, cicloKey, ...params]
  const rows = await query<any[]>(sql, queryParams)
  
  return rows.map(r => {
    const promoted = calculatePromotedGrado(r.gradoBase, r.plantel, r.cicloBase, cicloKey)
    return {
      ...r,
      grado: displayGrado(promoted.grado),
      nivel: promoted.nivel,
      interno: r.internoBase
    }
  })
})
