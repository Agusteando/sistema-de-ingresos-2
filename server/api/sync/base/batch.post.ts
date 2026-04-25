import { runWithBridgeAgentId } from '../../../utils/db'
import {
  ACTIVE_SYNC_STATUSES,
  EXTERNAL_SYNC_BATCH_LIMIT,
  createEmptyCounters,
  finishRun,
  getExternalSyncConfig,
  isRunCancelled,
  logSyncError,
  logSyncInfo,
  processExternalRowsBatch,
  readSyncRun,
  safeErrorMessage,
  toStatusPayload,
  updateRunProgress
} from '../../../utils/externalBaseSync'

const mergeCounters = (run: any, batch: ReturnType<typeof createEmptyCounters>) => {
  const totalFromRun = Number(run?.total_rows || 0)
  const total = totalFromRun > 0 ? totalFromRun : batch.total

  return {
    total,
    processed: Number(run?.processed_rows || 0) + batch.processed,
    updated: Number(run?.updated_rows || 0) + batch.updated,
    skipped: Number(run?.skipped_rows || 0) + batch.skipped,
    errors: Number(run?.error_rows || 0) + batch.errors
  }
}

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

  const body = await readBody(event)
  const runId = Number(body?.run_id || 0)
  const rows = Array.isArray(body?.rows) ? body.rows : []

  if (!runId) {
    throw createError({ statusCode: 400, message: 'run_id requerido.' })
  }

  if (rows.length === 0) {
    throw createError({ statusCode: 400, message: 'rows requerido.' })
  }

  if (rows.length > EXTERNAL_SYNC_BATCH_LIMIT) {
    throw createError({
      statusCode: 400,
      message: `El lote excede el máximo permitido de ${EXTERNAL_SYNC_BATCH_LIMIT} filas.`
    })
  }

  const syncConfig = getExternalSyncConfig()
  const dbAgentId = event.context.dbBridgeAgentId || plantel

  if (!syncConfig.apiKey) {
    throw createError({
      statusCode: 500,
      message: 'EXTERNAL_SYNC_API_KEY no está configurada en producción.'
    })
  }

  return await runWithBridgeAgentId(dbAgentId, async () => {
    const run = await readSyncRun(runId)

    if (!run) {
      throw createError({ statusCode: 404, message: 'Sincronización no encontrada.' })
    }

    if (run.plantel !== plantel) {
      throw createError({ statusCode: 403, message: 'La sincronización no pertenece al plantel activo.' })
    }

    if (Number(run.cancelled || 0) === 1 || run.status === 'cancelled') {
      const counters = {
        total: Number(run.total_rows || 0),
        processed: Number(run.processed_rows || 0),
        updated: Number(run.updated_rows || 0),
        skipped: Number(run.skipped_rows || 0),
        errors: Number(run.error_rows || 0)
      }

      const cancelledRun = await finishRun(runId, 'cancelled', 'Sincronización cancelada por el usuario.', counters)
      return toStatusPayload(cancelledRun)
    }

    if (!ACTIVE_SYNC_STATUSES.includes(run.status)) {
      return toStatusPayload(run)
    }

    try {
      logSyncInfo('Processing client-orchestrated sync batch.', {
        plantel,
        runId,
        rows: rows.length,
        currentProcessed: Number(run.processed_rows || 0),
        total: Number(run.total_rows || 0)
      })

      const batchCounters = await processExternalRowsBatch(runId, plantel, rows, syncConfig.apiKey)
      const currentRun = await readSyncRun(runId)
      const mergedCounters = mergeCounters(currentRun, batchCounters)

      if (await isRunCancelled(runId)) {
        const cancelledRun = await finishRun(runId, 'cancelled', 'Sincronización cancelada por el usuario.', mergedCounters)
        return toStatusPayload(cancelledRun)
      }

      const complete = mergedCounters.total > 0 && mergedCounters.processed >= mergedCounters.total

      if (complete) {
        const finalMessage = mergedCounters.errors > 0
          ? `Sincronización finalizada con ${mergedCounters.errors} errores.`
          : 'Sincronización finalizada exitosamente.'

        const completedRun = await finishRun(runId, 'completed', finalMessage, mergedCounters)

        logSyncInfo('Run completed.', {
          plantel,
          runId,
          ...mergedCounters
        })

        return toStatusPayload(completedRun)
      }

      await updateRunProgress(
        runId,
        mergedCounters,
        `Actualizando alumnos... ${mergedCounters.processed}/${mergedCounters.total}`
      )

      const updatedRun = await readSyncRun(runId)

      return toStatusPayload(updatedRun)
    } catch (error: any) {
      const message = safeErrorMessage(error)
      const latestRun = await readSyncRun(runId)
      const counters = {
        total: Number(latestRun?.total_rows || run.total_rows || 0),
        processed: Number(latestRun?.processed_rows || run.processed_rows || 0),
        updated: Number(latestRun?.updated_rows || run.updated_rows || 0),
        skipped: Number(latestRun?.skipped_rows || run.skipped_rows || 0),
        errors: Number(latestRun?.error_rows || run.error_rows || 0)
      }

      logSyncError('Batch failed.', {
        plantel,
        runId,
        message,
        ...counters
      })

      const failedRun = await finishRun(runId, 'error', message, counters)
      setResponseStatus(event, 502)

      return toStatusPayload(failedRun)
    }
  })
})