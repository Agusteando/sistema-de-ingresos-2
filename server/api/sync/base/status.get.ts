import { query } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || !user.active_plantel) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const plantel = user.active_plantel
  if (plantel === 'GLOBAL') {
    return { status: 'idle', message: 'No aplicable a plantel global.' }
  }

  const [latestRun] = await query<any[]>(
    `SELECT id, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, message 
     FROM external_sync_runs 
     WHERE plantel = ? 
     ORDER BY id DESC LIMIT 1`,
    [plantel]
  )

  if (!latestRun) {
    return { status: 'none', message: 'No hay sincronizaciones previas.' }
  }

  return {
    run_id: latestRun.id,
    status: latestRun.status,
    started_at: latestRun.started_at,
    finished_at: latestRun.finished_at,
    total: latestRun.total_rows || 0,
    processed: latestRun.processed_rows || 0,
    updated: latestRun.updated_rows || 0,
    skipped: latestRun.skipped_rows || 0,
    errors: latestRun.error_rows || 0,
    message: latestRun.message || ''
  }
})