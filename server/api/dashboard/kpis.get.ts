import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { ciclo = '2024' } = getQuery(event)
  const user = event.context.user
  
  if (user.role !== 'global') {
    throw createError({ statusCode: 403, message: 'Información restringida a nivel global.' })
  }

  let alumnosWhere = "estatus = 'Activo'"
  let ingresosWhere = "ciclo = ? AND estatus = 'Vigente' AND MONTH(fecha) = MONTH(CURRENT_DATE())"
  const paramArr: any[] = [ciclo]

  if (user.active_plantel !== 'GLOBAL') {
    alumnosWhere += " AND plantel = ?"
    ingresosWhere += " AND plantel = ?"
    paramArr.push(user.active_plantel)
  }

  const alumnosParams = user.active_plantel !== 'GLOBAL' ? [user.active_plantel] : []

  const [alumnosData] = await query<any[]>(`SELECT COUNT(*) as total FROM base WHERE ${alumnosWhere}`, alumnosParams)
  const [ingresosData] = await query<any[]>(`SELECT SUM(monto) as total FROM referenciasdepago WHERE ${ingresosWhere}`, paramArr)
  const [conceptosData] = await query<any[]>(`SELECT COUNT(*) as total FROM conceptos WHERE ciclo = ?`, [ciclo])

  return {
    totalAlumnos: alumnosData?.total || 0,
    ingresosMes: ingresosData?.total || 0,
    conceptosActivos: conceptosData?.total || 0
  }
})