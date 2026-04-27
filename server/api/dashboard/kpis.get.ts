import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  let alumnosWhere = "estatus = 'Activo'"
  let ingresosWhere = "r.ciclo = ? AND r.estatus = 'Vigente' AND MONTH(r.fecha) = MONTH(CURRENT_DATE())"
  const paramArr: any[] = [cicloKey]
  const alumnosParams: any[] = []

  if (user.active_plantel !== 'GLOBAL') {
    alumnosWhere += " AND plantel = ?"
    ingresosWhere += " AND r.plantel = ?"
    paramArr.push(user.active_plantel)
    alumnosParams.push(user.active_plantel)
  }

  const alumnosRows = await query<any[]>(`
    SELECT grado as gradoBase, ciclo as cicloBase, plantel, interno
    FROM base WHERE ${alumnosWhere}
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

  return {
    totalAlumnos: alumnosInScope.length,
    internos: alumnosInScope.filter(row => String(row.interno) === '1').length,
    externos: alumnosInScope.filter(row => String(row.interno) === '0').length,
    ingresosMes,
    conceptosActivos: conceptosData?.total || 0
  }
})
