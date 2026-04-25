import { query } from '../../../utils/db'

const ACTIVE_STATUSES = ['running', 'fetching', 'processing']

const toStatusPayload = (run: any, fallbackMessage = '') => {
  if (!run) {
    return {
      success: true,
      status: 'none',
      message: fallbackMessage || 'No hay sincronizaciones registradas.'
    }
  }

  return {
    success: true,
    run_id: run.id,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    total: Number(run.total_rows || 0),
    processed: Number(run.processed_rows || 0),
    updated: Number(run.updated_rows || 0),
    skipped: Number(run.skipped_rows || 0),
    errors: Number(run.error_rows || 0),
    message: run.message || fallbackMessage || ''
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')

  const user = event.context.user
  if (!user || !user.active_plantel) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const plantel = user.active_plantel
  if (plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'La sincronización debe cancelarse desde un plantel específico.' })
  }

  console.info('[External Base Sync] Cancellation requested.', {
    plantel,
    user: user.email || user.name || 'unknown'
  })

  const [latestRun] = await query<any[]>(
    `SELECT id, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE plantel = ?
     ORDER BY id DESC
     LIMIT 1`,
    [plantel]
  )

  if (!latestRun || !ACTIVE_STATUSES.includes(latestRun.status)) {
    console.info('[External Base Sync] Cancellation ignored because no active run exists.', {
      plantel,
      latestRunId: latestRun?.id || null,
      latestStatus: latestRun?.status || null
    })

    return toStatusPayload(latestRun, 'No hay una sincronización activa para cancelar.')
  }

  await query(
    `UPDATE external_sync_runs
     SET cancelled = 1,
         status = 'cancelled',
         finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
         message = 'Cancelación registrada. Si el proceso seguía activo, se detendrá en el siguiente punto de control.'
     WHERE id = ? AND plantel = ? AND status IN ('running', 'fetching', 'processing')`,
    [latestRun.id, plantel]
  )

  const [updatedRun] = await query<any[]>(
    `SELECT id, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE id = ?
     LIMIT 1`,
    [latestRun.id]
  )

  console.info('[External Base Sync] Cancellation stored.', {
    plantel,
    runId: latestRun.id,
    status: updatedRun?.status || 'unknown'
  })

  return toStatusPayload(updatedRun, 'Cancelación registrada.')
})