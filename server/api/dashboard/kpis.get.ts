import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'
import { previousCicloKey, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'

export default defineEventHandler(async (event) => {
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const previousCiclo = previousCicloKey(cicloKey)
  const user = event.context.user
  
  let alumnosWhere = "A.estatus = 'Activo'"
  let ingresosWhere = "r.ciclo = ? AND r.estatus = 'Vigente' AND MONTH(r.fecha) = MONTH(CURRENT_DATE())"
  const paramArr: any[] = [cicloKey]
  const alumnosParams: any[] = [cicloKey, cicloKey, previousCiclo, previousCiclo]

  if (user.active_plantel !== 'GLOBAL') {
    alumnosWhere += " AND A.plantel = ?"
    ingresosWhere += " AND r.plantel = ?"
    paramArr.push(user.active_plantel)
    alumnosParams.push(user.active_plantel)
  }

  const alumnosRows = await query<any[]>(`
    SELECT
      A.grado as gradoBase,
      A.ciclo as cicloBase,
      A.ciclo,
      A.plantel,
      B.conceptosPagados,
      C.conceptosCargados,
      BPrev.conceptosPagadosPrevios,
      CPrev.conceptosCargadosPrevios,
      CONCAT_WS('|', B.conceptosPagados, C.conceptosCargados) AS conceptosCicloActual,
      CONCAT_WS('|', BPrev.conceptosPagadosPrevios, CPrev.conceptosCargadosPrevios) AS conceptosCicloPrevio
    FROM base A
    LEFT JOIN (
      SELECT matricula, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosPagados
      FROM referenciasdepago
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) B ON A.matricula = B.matricula
    LEFT JOIN (
      SELECT matricula, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargados
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo'
      GROUP BY matricula
    ) C ON A.matricula = C.matricula
    LEFT JOIN (
      SELECT matricula, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosPagadosPrevios
      FROM referenciasdepago
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) BPrev ON A.matricula = BPrev.matricula
    LEFT JOIN (
      SELECT matricula, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargadosPrevios
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo'
      GROUP BY matricula
    ) CPrev ON A.matricula = CPrev.matricula
    WHERE ${alumnosWhere}
  `, alumnosParams)

  const alumnosInScope = alumnosRows.filter(row => (
    !isOutOfScopeForPlantelCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey)
  ))
  
  const ingresosRows = await query<any[]>(`
    SELECT r.monto, A.grado as gradoBase, A.ciclo as cicloBase, COALESCE(A.plantel, r.plantel) as plantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${ingresosWhere}
  `, paramArr)
  const ingresosMes = ingresosRows
    .filter(row => !isOutOfScopeForPlantelCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey))
    .reduce((sum, row) => sum + Number(row.monto || 0), 0)

  const [conceptosData] = await query<any[]>(`SELECT COUNT(*) as total FROM conceptos WHERE ciclo = ?`, [cicloKey])
  const tipoIngresoCounts = alumnosInScope.reduce((acc, row) => {
    const tipoIngreso = resolveTipoIngreso({
      ...row,
      tipoIngresoEvidence: {
        targetCiclo: cicloKey,
        previousCiclo,
        targetConcepts: [row.conceptosPagados, row.conceptosCargados, row.conceptosCicloActual],
        previousConcepts: [row.conceptosPagadosPrevios, row.conceptosCargadosPrevios, row.conceptosCicloPrevio]
      }
    }, cicloKey)

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
})
