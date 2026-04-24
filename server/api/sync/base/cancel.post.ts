import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || !user.active_plantel) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const plantel = user.active_plantel

  await query(
    `UPDATE external_sync_runs SET cancelled = 1, message = 'Cancelación solicitada...' 
     WHERE plantel = ? AND status IN ('running', 'fetching', 'processing')`,
    [plantel]
  )

  return { success: true, message: 'Señal de cancelación enviada correctamente.' }
})