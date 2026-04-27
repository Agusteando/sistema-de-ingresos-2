import { query, runWithBridgeAgentId } from '../../../utils/db'
import {
  ACTIVE_SYNC_STATUSES,
  attachRowSignatures,
  cleanupBlockingRuns,
  createEmptyCounters,
  fetchExternalRows,
  fetchCurrentEnrollmentCicloKey,
  finishRun,
  getExternalSyncConfig,
  isRunCancelled,
  logSyncError,
  logSyncInfo,
  logSyncWarn,
  markRunStatus,
  readSyncRun,
  safeErrorMessage,
  toStatusPayload
} from '../../../utils/externalBaseSync'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')

  const user = event.context.user
  if (!user || !user.active_plantel) {
    throw createError({ statusCode: 401, message: 'Sesión no válida o plantel no definido.' })
  }

  const plantel = user.active_plantel
  if (plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'La sincronización debe realizarse por plantel específico.' })
  }

  const syncConfig = getExternalSyncConfig()
  const dbAgentId = event.context.dbBridgeAgentId || plantel

  if (!syncConfig.apiKey) {
    throw createError({
      statusCode: 500,
      message: 'EXTERNAL_SYNC_API_KEY no está configurada en producción.'
    })
  }

  logSyncInfo('Manual sync request received.', {
    plantel,
    dbAgentId,
    user: user.email || user.name || 'unknown',
    timeoutMs: syncConfig.timeoutMs
  })

  await cleanupBlockingRuns(plantel, syncConfig.staleAfterMinutes)

  const [existingRun] = await query<any[]>(
    `SELECT id, plantel, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE plantel = ?
       AND status IN ('running', 'fetching', 'processing')
     ORDER BY id DESC
     LIMIT 1`,
    [plantel]
  )

  if (existingRun) {
    logSyncWarn('Manual sync rejected because another run is active.', {
      plantel,
      existingRunId: existingRun.id,
      existingStatus: existingRun.status
    })

    return toStatusPayload(existingRun, {
      success: true,
      start_result: 'already_running',
      rows: [],
      message: existingRun.message || 'Ya existe una sincronización activa para este plantel.'
    })
  }

  const insertResult: any = await query(
    `INSERT INTO external_sync_runs (plantel, status, message)
     VALUES (?, 'fetching', 'Consultando base externa...')`,
    [plantel]
  )

  const runId = Number(insertResult.insertId)
  const emptyCounters = createEmptyCounters()

  logSyncInfo('Run created.', {
    plantel,
    runId
  })

  return await runWithBridgeAgentId(dbAgentId, async () => {
    try {
      const syncCicloKey = await fetchCurrentEnrollmentCicloKey()

      logSyncInfo('Current ciclo resolved for sync run.', {
        plantel,
        runId,
        ciclo: syncCicloKey
      })

      const rows = await fetchExternalRows(syncConfig, plantel, runId)
      const counters = createEmptyCounters(rows.length)

      if (await isRunCancelled(runId)) {
        const cancelledRun = await finishRun(
          runId,
          'cancelled',
          'Sincronización cancelada después de consultar la base externa.',
          counters
        )

        return toStatusPayload(cancelledRun, {
          rows: [],
          start_result: 'cancelled'
        })
      }

      if (rows.length === 0) {
        const completedRun = await finishRun(
          runId,
          'completed',
          'No hay alumnos para actualizar.',
          counters
        )

        return toStatusPayload(completedRun, {
          rows: [],
          start_result: 'completed'
        })
      }

      await markRunStatus(runId, 'processing', 'Listo para actualizar alumnos.', counters)

      const run = await readSyncRun(runId)
      const signedRows = attachRowSignatures(rows, runId, plantel, syncConfig.apiKey, syncCicloKey)

      logSyncInfo('Rows prepared for client-side batch orchestration.', {
        plantel,
        runId,
        ciclo: syncCicloKey,
        rows: signedRows.length
      })

      return toStatusPayload(run, {
        rows: signedRows,
        start_result: 'ready',
        ciclo: syncCicloKey
      })
    } catch (error: any) {
      const message = safeErrorMessage(error)

      logSyncError('Run failed during external fetch.', {
        runId,
        plantel,
        message
      })

      const failedRun = await finishRun(runId, 'error', message, emptyCounters)
      setResponseStatus(event, 502)

      return toStatusPayload(failedRun, {
        rows: [],
        start_result: 'error'
      })
    }
  })
})
