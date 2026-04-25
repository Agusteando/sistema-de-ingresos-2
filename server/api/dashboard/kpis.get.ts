import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
  let alumnosWhere = "estatus = 'Activo' AND ciclo = ?"
  let ingresosWhere = "ciclo = ? AND estatus = 'Vigente' AND MONTH(fecha) = MONTH(CURRENT_DATE())"
  const paramArr: any[] = [cicloKey]
  const alumnosParams: any[] = [cicloKey]

  if (user.active_plantel !== 'GLOBAL') {
    alumnosWhere += " AND plantel = ?"
    ingresosWhere += " AND plantel = ?"
    paramArr.push(user.active_plantel)
    alumnosParams.push(user.active_plantel)
  }

  const [alumnosData] = await query<any[]>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN interno = 1 THEN 1 ELSE 0 END) as internos,
      SUM(CASE WHEN interno = 0 THEN 1 ELSE 0 END) as externos
    FROM base WHERE ${alumnosWhere}
  `, alumnosParams)
  
  const [ingresosData] = await query<any[]>(`SELECT SUM(monto) as total FROM referenciasdepago WHERE ${ingresosWhere}`, paramArr)
  const [conceptosData] = await query<any[]>(`SELECT COUNT(*) as total FROM conceptos WHERE ciclo = ?`, [cicloKey])

  return {
    totalAlumnos: alumnosData?.total || 0,
    internos: alumnosData?.internos || 0,
    externos: alumnosData?.externos || 0,
    ingresosMes: ingresosData?.total || 0,
    conceptosActivos: conceptosData?.total || 0
  }
})
