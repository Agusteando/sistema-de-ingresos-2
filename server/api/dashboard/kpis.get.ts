import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { ciclo = '2024' } = getQuery(event)
  
  const [alumnosData] = await query<any[]>(`SELECT COUNT(*) as total FROM base WHERE estatus = 'Activo'`)
  const [ingresosData] = await query<any[]>(`SELECT SUM(monto) as total FROM referenciasdepago WHERE ciclo = ? AND estatus = 'Vigente' AND MONTH(fecha) = MONTH(CURRENT_DATE())`, [ciclo])
  const [conceptosData] = await query<any[]>(`SELECT COUNT(*) as total FROM conceptos WHERE ciclo = ?`, [ciclo])

  return {
    totalAlumnos: alumnosData?.total || 0,
    ingresosMes: ingresosData?.total || 0,
    conceptosActivos: conceptosData?.total || 0
  }
})