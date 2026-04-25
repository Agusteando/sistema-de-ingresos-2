import crypto from 'node:crypto'
import { executeStatementTransaction, query, runWithBridgeAgentId, type SqlStatement } from '../../../utils/db'

type SyncCounters = {
  total: number
  processed: number
  updated: number
  skipped: number
  errors: number
}

type SyncRuntimeConfig = {
  apiUrl: string
  apiKey: string
  timeoutMs: number
  staleAfterMinutes: number
  debug: boolean
}

const ACTIVE_STATUSES = ['running', 'fetching', 'processing']
const DEFAULT_CICLO = '2025'
const LOG_PREFIX = '[External Base Sync]'

const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const getSyncRuntimeConfig = (): SyncRuntimeConfig => {
  const config = useRuntimeConfig()

  return {
    apiUrl: String(config.externalSyncUrl || 'https://matricula.casitaapps.com/api/sync').trim(),
    apiKey: String(config.externalSyncApiKey || '').trim(),
    timeoutMs: parsePositiveInteger(config.externalSyncTimeoutMs, 60000),
    staleAfterMinutes: parsePositiveInteger(config.externalSyncStaleAfterMinutes, 30),
    debug: String(config.externalSyncDebug || process.env.DEBUG_EXTERNAL_SYNC || '').toLowerCase() === 'true'
  }
}

const logInfo = (message: string, payload: Record<string, any> = {}) => {
  console.info(`${LOG_PREFIX} ${message}`, payload)
}

const logWarn = (message: string, payload: Record<string, any> = {}) => {
  console.warn(`${LOG_PREFIX} ${message}`, payload)
}

const logError = (message: string, payload: Record<string, any> = {}) => {
  console.error(`${LOG_PREFIX} ${message}`, payload)
}

const logDebug = (syncConfig: SyncRuntimeConfig, message: string, payload: Record<string, any> = {}) => {
  if (!syncConfig.debug) return
  console.info(`${LOG_PREFIX} DEBUG ${message}`, payload)
}

const normalizeMatricula = (value: unknown) => String(value || '').trim()

const buildExternalUrl = (baseUrl: string, plantel: string) => {
  const url = new URL(baseUrl)
  url.searchParams.set('plantel', plantel)
  return url.toString()
}

const safeErrorMessage = (error: any) => {
  if (!error) return 'Error desconocido durante la sincronización'
  if (error.name === 'AbortError') return 'Tiempo agotado consultando matricula.casitaapps.com'
  return String(error.message || error)
}

const toStatusPayload = (run: any, extra: Record<string, any> = {}) => {
  if (!run) {
    return {
      success: true,
      status: 'none',
      message: 'No hay sincronizaciones registradas.',
      total: 0,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      ...extra
    }
  }

  return {
    success: run.status === 'completed',
    run_id: run.id,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    total: Number(run.total_rows || 0),
    processed: Number(run.processed_rows || 0),
    updated: Number(run.updated_rows || 0),
    skipped: Number(run.skipped_rows || 0),
    errors: Number(run.error_rows || 0),
    message: run.message || '',
    ...extra
  }
}

const readRun = async (runId: number) => {
  const [run] = await query<any[]>(
    `SELECT id, plantel, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE id = ?
     LIMIT 1`,
    [runId]
  )

  return run
}

const readLatestRun = async (plantel: string) => {
  const [run] = await query<any[]>(
    `SELECT id, plantel, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE plantel = ?
     ORDER BY id DESC
     LIMIT 1`,
    [plantel]
  )

  return run
}

const cleanupBlockingRuns = async (plantel: string, staleAfterMinutes: number) => {
  await query(
    `UPDATE external_sync_runs
     SET status = 'cancelled',
         finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
         message = 'Cancelación confirmada antes de iniciar una nueva sincronización.'
     WHERE plantel = ?
       AND cancelled = 1
       AND status IN ('running', 'fetching', 'processing')`,
    [plantel]
  )

  await query(
    `UPDATE external_sync_runs
     SET status = 'abandoned',
         finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
         message = CONCAT(COALESCE(message, ''), ' | Marcada como abandonada antes de iniciar una nueva sincronización.')
     WHERE plantel = ?
       AND cancelled = 0
       AND status IN ('running', 'fetching', 'processing')
       AND started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${staleAfterMinutes} MINUTE)`,
    [plantel]
  )
}

const updateRunProgress = async (runId: number, counters: SyncCounters, message?: string) => {
  if (message) {
    await query(
      `UPDATE external_sync_runs
       SET total_rows = ?,
           processed_rows = ?,
           updated_rows = ?,
           skipped_rows = ?,
           error_rows = ?,
           message = ?
       WHERE id = ?`,
      [counters.total, counters.processed, counters.updated, counters.skipped, counters.errors, message, runId]
    )
    return
  }

  await query(
    `UPDATE external_sync_runs
     SET total_rows = ?,
         processed_rows = ?,
         updated_rows = ?,
         skipped_rows = ?,
         error_rows = ?
     WHERE id = ?`,
    [counters.total, counters.processed, counters.updated, counters.skipped, counters.errors, runId]
  )
}

const markRunStatus = async (runId: number, status: string, message: string, counters?: SyncCounters) => {
  if (counters) {
    await query(
      `UPDATE external_sync_runs
       SET status = ?,
           total_rows = ?,
           processed_rows = ?,
           updated_rows = ?,
           skipped_rows = ?,
           error_rows = ?,
           message = ?
       WHERE id = ?`,
      [status, counters.total, counters.processed, counters.updated, counters.skipped, counters.errors, message, runId]
    )
    return
  }

  await query(
    `UPDATE external_sync_runs
     SET status = ?,
         message = ?
     WHERE id = ?`,
    [status, message, runId]
  )
}

const finishRun = async (runId: number, status: string, message: string, counters: SyncCounters) => {
  await query(
    `UPDATE external_sync_runs
     SET status = ?,
         finished_at = CURRENT_TIMESTAMP,
         total_rows = ?,
         processed_rows = ?,
         updated_rows = ?,
         skipped_rows = ?,
         error_rows = ?,
         message = ?
     WHERE id = ?`,
    [status, counters.total, counters.processed, counters.updated, counters.skipped, counters.errors, message, runId]
  )

  return await readRun(runId)
}

const isRunCancelled = async (runId: number) => {
  const [run] = await query<any[]>(
    `SELECT cancelled FROM external_sync_runs WHERE id = ? LIMIT 1`,
    [runId]
  )

  return Number(run?.cancelled || 0) === 1
}

const fetchExternalRows = async (syncConfig: SyncRuntimeConfig, plantel: string, runId: number) => {
  if (!syncConfig.apiKey) {
    throw new Error('EXTERNAL_SYNC_API_KEY no está configurada.')
  }

  const apiUrl = buildExternalUrl(syncConfig.apiUrl, plantel)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), syncConfig.timeoutMs)

  try {
    logInfo('Fetching external API.', {
      runId,
      plantel,
      apiHost: new URL(apiUrl).host,
      timeoutMs: syncConfig.timeoutMs
    })

    const startedAt = Date.now()
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${syncConfig.apiKey}`,
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: controller.signal
    })

    const elapsedMs = Date.now() - startedAt

    logInfo('External API responded.', {
      runId,
      plantel,
      status: response.status,
      ok: response.ok,
      elapsedMs
    })

    if (!response.ok) {
      throw new Error(`Error en API externa: ${response.status} ${response.statusText}`)
    }

    const rawData = await response.json()
    const rows = Array.isArray(rawData) ? rawData : rawData?.data

    if (!Array.isArray(rows)) {
      throw new Error('La API externa no devolvió un arreglo ni un objeto con propiedad data[].')
    }

    logDebug(syncConfig, 'External API payload summary.', {
      runId,
      plantel,
      rows: rows.length,
      firstRowKeys: rows[0] ? Object.keys(rows[0]).slice(0, 20) : []
    })

    return rows
  } finally {
    clearTimeout(timeout)
  }
}

const processRow = async (row: any, plantel: string, syncConfig: SyncRuntimeConfig, runId: number, rowIndex: number) => {
  const matricula = normalizeMatricula(row?.matricula)

  if (!matricula) {
    logWarn('Skipping external row without matrícula.', {
      runId,
      plantel,
      rowIndex,
      rowKeys: row ? Object.keys(row).slice(0, 20) : []
    })
    return 'error'
  }

  const mapped = mapExternalRow(row)
  const sourceHash = computeHash(mapped)

  const [state] = await query<any[]>(
    `SELECT
       (SELECT source_hash FROM external_base_sync WHERE matricula = ? LIMIT 1) AS source_hash,
       (SELECT estatus FROM base WHERE matricula = ? LIMIT 1) AS local_estatus,
       (SELECT COUNT(*) FROM base WHERE matricula = ?) AS local_count`,
    [matricula, matricula, matricula]
  )

  const localExists = Number(state?.local_count || 0) > 0
  const localEstatus = String(state?.local_estatus || '').trim()

  if (localExists && state?.source_hash === sourceHash) {
    logDebug(syncConfig, 'Row skipped because source hash is unchanged.', {
      runId,
      plantel,
      rowIndex,
      matricula
    })
    return 'skipped'
  }

  const finalEstatus = resolveFinalEstatus(row, localEstatus, matricula, runId, plantel)
  const fullName = [mapped.apellidoPaterno, mapped.apellidoMaterno, mapped.nombres].filter(Boolean).join(' ').trim() || matricula

  const statements: SqlStatement[] = []

  if (localExists) {
    statements.push({
      sql: `
        UPDATE base SET
          apellidoPaterno = ?,
          apellidoMaterno = ?,
          nombres = ?,
          nombreCompleto = ?,
          nivel = ?,
          grado = ?,
          grupo = ?,
          interno = ?,
          correo = ?,
          telefono = ?,
          \`Nombre del padre o tutor\` = ?,
          estatus = ?
        WHERE matricula = ?
      `,
      params: [
        mapped.apellidoPaterno,
        mapped.apellidoMaterno,
        mapped.nombres,
        fullName,
        mapped.nivel,
        mapped.grado,
        mapped.grupo,
        mapped.interno,
        mapped.correo,
        mapped.telefono,
        mapped.padre,
        finalEstatus,
        matricula
      ]
    })
  } else {
    statements.push({
      sql: `
        INSERT INTO base (
          matricula,
          plantel,
          apellidoPaterno,
          apellidoMaterno,
          nombres,
          nombreCompleto,
          nivel,
          grado,
          grupo,
          interno,
          correo,
          telefono,
          \`Nombre del padre o tutor\`,
          estatus,
          \`Fecha de nacimiento\`,
          ciclo,
          usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sistema Sync')
      `,
      params: [
        matricula,
        plantel,
        mapped.apellidoPaterno,
        mapped.apellidoMaterno,
        mapped.nombres,
        fullName,
        mapped.nivel,
        mapped.grado,
        mapped.grupo,
        mapped.interno,
        mapped.correo,
        mapped.telefono,
        mapped.padre,
        finalEstatus,
        '',
        DEFAULT_CICLO
      ]
    })
  }

  statements.push({
    sql: `
      INSERT INTO external_base_sync (matricula, plantel, source_hash, last_synced_at, last_payload, last_error)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, NULL)
      ON DUPLICATE KEY UPDATE
        plantel = VALUES(plantel),
        source_hash = VALUES(source_hash),
        last_synced_at = VALUES(last_synced_at),
        last_payload = VALUES(last_payload),
        last_error = NULL
    `,
    params: [matricula, plantel, sourceHash, JSON.stringify(row)]
  })

  await executeStatementTransaction(statements)

  logDebug(syncConfig, 'Row applied.', {
    runId,
    plantel,
    rowIndex,
    matricula,
    action: localExists ? 'update' : 'insert',
    finalEstatus
  })

  return 'updated'
}

const resolveFinalEstatus = (row: any, localEstatus: string, matricula: string, runId: number, plantel: string) => {
  const externalBaja = row?.baja === 1 || row?.baja === true || String(row?.baja).toLowerCase() === 'true'

  if (externalBaja) {
    return String(row?.motivo_baja || row?.categoria_baja || 'Baja').trim()
  }

  if (localEstatus && localEstatus !== 'Activo') {
    logInfo('Conservative baja preserved.', {
      runId,
      plantel,
      matricula,
      localEstatus
    })
    return localEstatus
  }

  return 'Activo'
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

  const syncConfig = getSyncRuntimeConfig()
  const dbAgentId = event.context.dbBridgeAgentId || plantel

  logInfo('Manual sync request received.', {
    plantel,
    dbAgentId,
    user: user.email || user.name || 'unknown',
    timeoutMs: syncConfig.timeoutMs,
    staleAfterMinutes: syncConfig.staleAfterMinutes,
    debug: syncConfig.debug
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
    logWarn('Manual sync rejected because another run is active.', {
      plantel,
      existingRunId: existingRun.id,
      existingStatus: existingRun.status
    })

    return toStatusPayload(existingRun, {
      success: true,
      start_result: 'already_running',
      message: existingRun.message || 'Ya existe una sincronización activa para este plantel.'
    })
  }

  const insertResult: any = await query(
    `INSERT INTO external_sync_runs (plantel, status, message)
     VALUES (?, 'running', 'Sincronización manual iniciada. Ejecutando dentro de la solicitud actual para evitar tareas serverless huérfanas.')`,
    [plantel]
  )

  const runId = Number(insertResult.insertId)

  logInfo('Run created.', {
    plantel,
    runId
  })

  const finalRun = await runSyncProcess(runId, plantel, dbAgentId, syncConfig)

  return toStatusPayload(finalRun, {
    start_result: finalRun?.status || 'unknown'
  })
})

async function runSyncProcess(runId: number, plantel: string, agentId: string, syncConfig: SyncRuntimeConfig) {
  const counters: SyncCounters = {
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  }

  return await runWithBridgeAgentId(agentId, async () => {
    try {
      await markRunStatus(runId, 'fetching', 'Consultando matrícula externa...', counters)

      const rows = await fetchExternalRows(syncConfig, plantel, runId)
      counters.total = rows.length

      if (await isRunCancelled(runId)) {
        logWarn('Run cancelled after external fetch.', { runId, plantel })
        return await finishRun(runId, 'cancelled', 'Sincronización cancelada después de consultar la API externa.', counters)
      }

      await markRunStatus(runId, 'processing', 'Procesando datos externos...', counters)

      logInfo('Processing rows.', {
        runId,
        plantel,
        total: counters.total
      })

      for (let index = 0; index < rows.length; index++) {
        if (index % 25 === 0) {
          if (await isRunCancelled(runId)) {
            logWarn('Run cancelled during processing.', {
              runId,
              plantel,
              processed: counters.processed,
              total: counters.total
            })

            return await finishRun(runId, 'cancelled', 'Sincronización cancelada por el usuario.', counters)
          }

          await updateRunProgress(
            runId,
            counters,
            `Procesando datos externos... ${counters.processed}/${counters.total}`
          )
        }

        try {
          const result = await processRow(rows[index], plantel, syncConfig, runId, index)

          counters.processed++

          if (result === 'updated') counters.updated++
          else if (result === 'skipped') counters.skipped++
          else counters.errors++
        } catch (rowError: any) {
          counters.processed++
          counters.errors++

          const matricula = normalizeMatricula(rows[index]?.matricula) || `ROW_${index + 1}`
          const message = safeErrorMessage(rowError)

          logError('Row failed.', {
            runId,
            plantel,
            rowIndex: index,
            matricula,
            message
          })

          try {
            await query(
              `INSERT INTO external_base_sync (matricula, plantel, source_hash, last_synced_at, last_error)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
               ON DUPLICATE KEY UPDATE
                 last_synced_at = CURRENT_TIMESTAMP,
                 last_error = VALUES(last_error)`,
              [matricula, plantel, 'ERROR', message]
            )
          } catch (metaError: any) {
            logError('Failed to store row error metadata.', {
              runId,
              plantel,
              rowIndex: index,
              matricula,
              message: safeErrorMessage(metaError)
            })
          }
        }
      }

      if (await isRunCancelled(runId)) {
        logWarn('Run cancelled before finalization.', { runId, plantel })
        return await finishRun(runId, 'cancelled', 'Sincronización cancelada por el usuario.', counters)
      }

      const finalMessage = counters.errors > 0
        ? `Sincronización finalizada con ${counters.errors} errores.`
        : 'Sincronización finalizada exitosamente.'

      const finalRun = await finishRun(runId, 'completed', finalMessage, counters)

      logInfo('Run completed.', {
        runId,
        plantel,
        ...counters
      })

      return finalRun
    } catch (error: any) {
      const message = safeErrorMessage(error)

      logError('Run failed.', {
        runId,
        plantel,
        message,
        ...counters
      })

      return await finishRun(runId, 'error', message, counters)
    }
  })
}

function mapExternalRow(row: any) {
  const padreFullName = [
    row.nombre_padre,
    row.apellido_paterno_padre,
    row.apellido_materno_padre
  ].filter(Boolean).join(' ').trim()

  const madreFullName = [
    row.nombre_madre,
    row.apellido_paterno_madre,
    row.apellido_materno_madre
  ].filter(Boolean).join(' ').trim()

  const padreTutor = padreFullName || madreFullName || 'No especificado'

  return {
    apellidoPaterno: String(row.apellido_paterno || '').trim(),
    apellidoMaterno: String(row.apellido_materno || '').trim(),
    nombres: String(row.nombres || '').trim(),
    nivel: String(row.nivel || 'Primaria').trim(),
    grado: String(row.grado || 'Primero').trim(),
    grupo: String(row.grupo || 'A').trim(),
    interno: (row.interno === false || row.interno === 0 || String(row.interno).toLowerCase() === 'false') ? 0 : 1,
    correo: String(row.email_padre || row.email_madre || '').trim(),
    telefono: String(row.telefono_padre || row.telefono_madre || '').trim(),
    padre: padreTutor,
    baja: row.baja,
    motivo_baja: row.motivo_baja,
    categoria_baja: row.categoria_baja
  }
}

function computeHash(mappedData: any) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(mappedData))
    .digest('hex')
}