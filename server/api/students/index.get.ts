import { runWithBridgeAgentId, query } from '../../utils/db'
import { calculatePromotedGrado, displayGrado } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { previousCicloKey, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import { attachCustomSectionsToStudents } from '../../utils/student-sections'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { q = '', ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const previousCiclo = previousCicloKey(cicloKey)
  const user = event.context.user
  
  let whereClause = "1=1"
  const params: any[] = []

  if (!user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')) {
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
      A.matricula, A.nombreCompleto, A.apellidoPaterno, A.apellidoMaterno, A.nombres, A.curp, A.genero,
      A.grado as gradoBase, A.grupo, A.ciclo as cicloBase, A.ciclo, A.plantel, A.nivel as nivelBase, A.estatus,
      A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre, A.\`Fecha de nacimiento\` as birth,
      Prev.previous_matricula AS matriculaAnterior,
      Next.successor_matricula AS matriculaSiguiente,
      IFNULL(B.pagosTotal, 0) AS pagosTotal,
      B.conceptosPagados,
      B.conceptoIdsPagados,
      IFNULL(C.saldo, 0) AS importeTotal,
      C.conceptosCargados,
      C.conceptoIdsCargados,
      BPrev.conceptosPagadosPrevios,
      BPrev.conceptoIdsPagadosPrevios,
      CPrev.conceptosCargadosPrevios,
      CPrev.conceptoIdsCargadosPrevios,
      CONCAT_WS('|', B.conceptosPagados, C.conceptosCargados) AS conceptosCicloActual,
      CONCAT_WS('|', B.conceptoIdsPagados, C.conceptoIdsCargados) AS conceptoIdsCicloActual,
      CONCAT_WS('|', BPrev.conceptosPagadosPrevios, CPrev.conceptosCargadosPrevios) AS conceptosCicloPrevio,
      CONCAT_WS('|', BPrev.conceptoIdsPagadosPrevios, CPrev.conceptoIdsCargadosPrevios) AS conceptoIdsCicloPrevio,
      (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto
    FROM base A
    LEFT JOIN (
      SELECT
        R.matricula AS matricula,
        SUM(R.monto) AS pagosTotal,
        GROUP_CONCAT(DISTINCT R.conceptoNombre SEPARATOR '|') AS conceptosPagados,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagados
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.ciclo = ? AND R.estatus = 'Vigente'
      GROUP BY R.matricula
    ) B ON A.matricula = B.matricula
    LEFT JOIN (
      SELECT
        cargos.matricula,
        SUM(cargos.monto) AS saldo,
        GROUP_CONCAT(DISTINCT cargos.conceptoNombre SEPARATOR '|') AS conceptosCargados,
        GROUP_CONCAT(DISTINCT cargos.conceptoId SEPARATOR '|') AS conceptoIdsCargados
      FROM (
        SELECT
          D.matricula,
          CASE
            WHEN P.accion = 'cambio' THEN COALESCE(P.montoFinal, ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100))
            ELSE COALESCE(D.montoFinal, ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100))
          END AS monto,
          IFNULL(P.conceptoNombre, D.conceptoNombre) AS conceptoNombre,
          CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) AS conceptoId
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
    LEFT JOIN (
      SELECT
        R.matricula AS matricula,
        GROUP_CONCAT(DISTINCT R.conceptoNombre SEPARATOR '|') AS conceptosPagadosPrevios,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagadosPrevios
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.ciclo = ? AND R.estatus = 'Vigente'
      GROUP BY R.matricula
    ) BPrev ON A.matricula = BPrev.matricula
    LEFT JOIN (
      SELECT
        matricula,
        GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargadosPrevios,
        GROUP_CONCAT(DISTINCT concepto SEPARATOR '|') AS conceptoIdsCargadosPrevios
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo'
      GROUP BY matricula
    ) CPrev ON A.matricula = CPrev.matricula
    LEFT JOIN alumno_matricula_links Prev ON Prev.successor_matricula = A.matricula
    LEFT JOIN alumno_matricula_links Next ON Next.previous_matricula = A.matricula
    WHERE ${whereClause}
    ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC
    LIMIT 5000;
  `
  
  const queryParams = [cicloKey, cicloKey, previousCiclo, previousCiclo, ...params]
  const rows = await query<any[]>(sql, queryParams)
  
  const mapped = rows.flatMap(r => {
    const promoted = calculatePromotedGrado(r.gradoBase, r.plantel, r.cicloBase, cicloKey, r.nivelBase)
    if (promoted.outOfScope) return []

    const tipoIngreso = resolveTipoIngreso({
      ...r,
      tipoIngresoEvidence: {
        targetCiclo: cicloKey,
        previousCiclo,
        targetConceptIds: [r.conceptoIdsPagados, r.conceptoIdsCargados, r.conceptoIdsCicloActual],
        previousConceptIds: [r.conceptoIdsPagadosPrevios, r.conceptoIdsCargadosPrevios, r.conceptoIdsCicloPrevio]
      }
    }, cicloKey)

    return {
      ...r,
      grado: displayGrado(promoted.grado),
      nivel: promoted.nivel,
      tipoIngreso
    }
  })

  return await attachCustomSectionsToStudents(mapped, user)
}))
