import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo, plantelCandidatesForProjectedScope } from '../../../shared/utils/grado'
import { previousCicloKey, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import { getHistoricalEnrollmentConceptEvidence, parseEnrollmentConceptIds } from '../../utils/enrollment-evidence'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { ciclo = '2025', concepts = '', tipoConcepts = '' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const previousCiclo = previousCicloKey(cicloKey)
  const user = event.context.user
  const enrollmentConceptIds = parseEnrollmentConceptIds(concepts)
  const tipoIngresoConceptIds = parseEnrollmentConceptIds(tipoConcepts).length ? parseEnrollmentConceptIds(tipoConcepts) : enrollmentConceptIds
  
  let alumnosWhere = "A.estatus = 'Activo'"
  let ingresosWhere = "r.ciclo = ? AND r.estatus = 'Vigente' AND COALESCE(r.depurado, 0) = 0 AND MONTH(r.fecha) = MONTH(CURRENT_DATE())"
  const paramArr: any[] = [cicloKey]
  const alumnosParams: any[] = [cicloKey, cicloKey, previousCiclo, previousCiclo]

  const isScopedToActivePlantel = user.active_plantel !== 'GLOBAL'

  if (isScopedToActivePlantel) {
    const plantelCandidates = plantelCandidatesForProjectedScope(user.active_plantel)
    const placeholders = plantelCandidates.map(() => '?').join(',')
    alumnosWhere += ` AND A.plantel IN (${placeholders})`
    ingresosWhere += ` AND COALESCE(A.plantel, r.plantel) IN (${placeholders})`
    paramArr.push(...plantelCandidates)
    alumnosParams.push(...plantelCandidates)
  }

  const alumnosRows = await query<any[]>(`
    SELECT
      A.matricula,
      A.grado as gradoBase,
      A.ciclo as cicloBase,
      A.ciclo,
      A.plantel,
      A.nivel as nivelBase,
      IFNULL(TIO.override_activo, 0) AS tipoIngresoOverrideActivo,
      IFNULL(TIO.tipo_forzado, 'externo') AS tipoIngresoOverride,
      B.conceptosPagados,
      B.conceptoIdsPagados,
      C.conceptosCargados,
      C.conceptoIdsCargados,
      BPrev.conceptosPagadosPrevios,
      BPrev.conceptoIdsPagadosPrevios,
      CPrev.conceptosCargadosPrevios,
      CPrev.conceptoIdsCargadosPrevios,
      CONCAT_WS('|', B.conceptosPagados, C.conceptosCargados) AS conceptosCicloActual,
      CONCAT_WS('|', B.conceptoIdsPagados, C.conceptoIdsCargados) AS conceptoIdsCicloActual,
      CONCAT_WS('|', BPrev.conceptosPagadosPrevios, CPrev.conceptosCargadosPrevios) AS conceptosCicloPrevio,
      CONCAT_WS('|', BPrev.conceptoIdsPagadosPrevios, CPrev.conceptoIdsCargadosPrevios) AS conceptoIdsCicloPrevio
    FROM base A
    LEFT JOIN student_tipo_ingreso_overrides TIO ON TIO.matricula = A.matricula
    LEFT JOIN (
      SELECT
        R.matricula AS matricula,
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
        matricula,
        GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargados,
        GROUP_CONCAT(DISTINCT concepto SEPARATOR '|') AS conceptoIdsCargados
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo'
      GROUP BY matricula
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
    WHERE ${alumnosWhere}
  `, alumnosParams)

  const alumnosInScope = alumnosRows.filter(row => (
    isInProjectedPlantelScopeForCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey, row.nivelBase, isScopedToActivePlantel ? user.active_plantel : 'GLOBAL')
  ))
  const historicalEnrollmentEvidence = await getHistoricalEnrollmentConceptEvidence(alumnosInScope.map(row => row.matricula), tipoIngresoConceptIds)
  
  const ingresosRows = await query<any[]>(`
    SELECT r.monto, A.grado as gradoBase, A.ciclo as cicloBase, A.nivel as nivelBase, COALESCE(A.plantel, r.plantel) as plantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${ingresosWhere}
  `, paramArr)
  const ingresosMes = ingresosRows
    .filter(row => isInProjectedPlantelScopeForCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey, row.nivelBase, isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'))
    .reduce((sum, row) => sum + Number(row.monto || 0), 0)

  const [conceptosData] = await query<any[]>(`SELECT COUNT(*) as total FROM conceptos WHERE ciclo = ?`, [cicloKey])
  const tipoIngresoCounts = alumnosInScope.reduce((acc, row) => {
    const historicalConceptIds = historicalEnrollmentEvidence.get(String(row.matricula || '').trim()) || ''
    const tipoIngreso = resolveTipoIngreso({
      ...row,
      tipoIngresoEvidence: {
        targetCiclo: cicloKey,
        previousCiclo,
        targetConceptIds: [row.conceptoIdsPagados, row.conceptoIdsCargados, row.conceptoIdsCicloActual],
        previousConceptIds: [row.conceptoIdsPagadosPrevios, row.conceptoIdsCargadosPrevios, row.conceptoIdsCicloPrevio],
        allConceptIds: [historicalConceptIds]
      }
    }, cicloKey, { enrollmentConcepts: tipoIngresoConceptIds })

    acc[tipoIngreso.value] += 1
    return acc
  }, { interno: 0, externo: 0 })

  return {
    totalAlumnos: alumnosInScope.length,
    internos: tipoIngresoCounts.interno,
    externos: tipoIngresoCounts.externo,
    ingresosMes,
    conceptosActivos: conceptosData?.total || 0
  }
}))
