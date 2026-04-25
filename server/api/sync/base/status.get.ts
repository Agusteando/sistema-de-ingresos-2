import { query } from '../../../utils/db'

const ACTIVE_STATUSES = ['running', 'fetching', 'processing']

const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const toStatusPayload = (run: any) => {
  if (!run) {
    return {
      status: 'none',
      message: 'No hay sincronizaciones previas.',
      total: 0,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    }
  }

  return {
    run_id: run.id,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    total: Number(run.total_rows || 0),
    processed: Number(run.processed_rows || 0),
    updated: Number(run.updated_rows || 0),
    skipped: Number(run.skipped_rows || 0),
    errors: Number(run.error_rows || 0),
    message: run.message || ''
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
    return { status: 'idle', message: 'No aplicable a plantel global.' }
  }

  const config = useRuntimeConfig()
  const staleAfterMinutes = parsePositiveInteger(config.externalSyncStaleAfterMinutes, 30)

  console.info('[External Base Sync] Manual status check.', {
    plantel,
    staleAfterMinutes
  })

  await query(
    `UPDATE external_sync_runs
     SET status = 'cancelled',
         finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
         message = 'Cancelación confirmada por consulta de estado.'
     WHERE plantel = ?
       AND cancelled = 1
       AND status IN ('running', 'fetching', 'processing')`,
    [plantel]
  )

  await query(
    `UPDATE external_sync_runs
     SET status = 'abandoned',
         finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
         message = CONCAT(COALESCE(message, ''), ' | Marcada como abandonada por exceder ventana serverless.')
     WHERE plantel = ?
       AND cancelled = 0
       AND status IN ('running', 'fetching', 'processing')
       AND started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${staleAfterMinutes} MINUTE)`,
    [plantel]
  )

  const [latestRun] = await query<any[]>(
    `SELECT id, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE plantel = ?
     ORDER BY id DESC
     LIMIT 1`,
    [plantel]
  )

  const payload = toStatusPayload(latestRun)

  console.info('[External Base Sync] Manual status result.', {
    plantel,
    runId: payload.run_id || null,
    status: payload.status,
    processed: payload.processed,
    total: payload.total
  })

  return payload
})