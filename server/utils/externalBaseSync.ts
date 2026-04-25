import crypto from 'node:crypto'
import { executeStatementTransaction, query, type SqlStatement } from './db'

export type SyncCounters = {
  total: number
  processed: number
  updated: number
  skipped: number
  errors: number
}

export type SyncRuntimeConfig = {
  apiUrl: string
  apiKey: string
  timeoutMs: number
  staleAfterMinutes: number
}

export const ACTIVE_SYNC_STATUSES = ['running', 'fetching', 'processing']
export const DEFAULT_SYNC_CICLO = '2025'
export const EXTERNAL_SYNC_URL = 'https://matricula.casitaapps.com/api/sync'
export const EXTERNAL_SYNC_TIMEOUT_MS = 60000
export const EXTERNAL_SYNC_STALE_AFTER_MINUTES = 30
export const EXTERNAL_SYNC_BATCH_LIMIT = 50
export const LOG_PREFIX = '[External Base Sync]'

export const createEmptyCounters = (total = 0): SyncCounters => ({
  total,
  processed: 0,
  updated: 0,
  skipped: 0,
  errors: 0
})

export const cleanApiKey = (value: unknown) => {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim()
}

export const getExternalSyncConfig = (): SyncRuntimeConfig => {
  const config = useRuntimeConfig()

  return {
    apiUrl: EXTERNAL_SYNC_URL,
    apiKey: cleanApiKey(config.externalSyncApiKey),
    timeoutMs: EXTERNAL_SYNC_TIMEOUT_MS,
    staleAfterMinutes: EXTERNAL_SYNC_STALE_AFTER_MINUTES
  }
}

export const logSyncInfo = (message: string, payload: Record<string, any> = {}) => {
  console.info(`${LOG_PREFIX} ${message}`, payload)
}

export const logSyncWarn = (message: string, payload: Record<string, any> = {}) => {
  console.warn(`${LOG_PREFIX} ${message}`, payload)
}

export const logSyncError = (message: string, payload: Record<string, any> = {}) => {
  console.error(`${LOG_PREFIX} ${message}`, payload)
}

export const normalizeMatricula = (value: unknown) => String(value || '').trim()

export const safeErrorMessage = (error: any) => {
  if (!error) return 'Error desconocido durante la sincronización'
  if (error.name === 'AbortError') return 'Tiempo agotado consultando matricula.casitaapps.com'
  return String(error.message || error)
}

export const toStatusPayload = (run: any, extra: Record<string, any> = {}) => {
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

export const readSyncRun = async (runId: number) => {
  const [run] = await query<any[]>(
    `SELECT id, plantel, status, started_at, finished_at, total_rows, processed_rows, updated_rows, skipped_rows, error_rows, cancelled, message
     FROM external_sync_runs
     WHERE id = ?
     LIMIT 1`,
    [runId]
  )

  return run
}

export const cleanupBlockingRuns = async (plantel: string, staleAfterMinutes = EXTERNAL_SYNC_STALE_AFTER_MINUTES) => {
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
         message = CONCAT(COALESCE(message, ''), ' | Ejecución anterior marcada como pendiente por exceder la ventana de ejecución.')
     WHERE plantel = ?
       AND cancelled = 0
       AND status IN ('running', 'fetching', 'processing')
       AND started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${staleAfterMinutes} MINUTE)`,
    [plantel]
  )
}

export const markRunStatus = async (runId: number, status: string, message: string, counters?: SyncCounters) => {
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

export const updateRunProgress = async (runId: number, counters: SyncCounters, message: string) => {
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
}

export const finishRun = async (runId: number, status: string, message: string, counters: SyncCounters) => {
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

  return await readSyncRun(runId)
}

export const isRunCancelled = async (runId: number) => {
  const [run] = await query<any[]>(
    `SELECT cancelled FROM external_sync_runs WHERE id = ? LIMIT 1`,
    [runId]
  )

  return Number(run?.cancelled || 0) === 1
}

export const buildExternalUrl = (syncConfig: SyncRuntimeConfig, plantel: string) => {
  const url = new URL(syncConfig.apiUrl)
  url.searchParams.set('plantel', plantel)
  return url.toString()
}

export const buildExternalHeaders = (syncConfig: SyncRuntimeConfig) => {
  if (!syncConfig.apiKey) {
    throw new Error('EXTERNAL_SYNC_API_KEY no está configurada en producción.')
  }

  return {
    Accept: 'application/json',
    Authorization: `Bearer ${syncConfig.apiKey}`,
    'x-api-key': syncConfig.apiKey
  }
}

export const readExternalErrorBody = async (response: Response) => {
  const text = await response.text().catch(() => '')
  return text.trim().slice(0, 500)
}

export const extractExternalRows = (rawData: any) => {
  if (Array.isArray(rawData)) {
    return {
      rows: rawData,
      meta: {
        responseShape: 'array'
      }
    }
  }

  if (rawData && typeof rawData === 'object' && Array.isArray(rawData.rows)) {
    return {
      rows: rawData.rows,
      meta: {
        responseShape: 'object.rows',
        hasMore: Boolean(rawData.hasMore),
        externalMs: rawData.ms ?? null,
        externalReqId: rawData.reqId || null
      }
    }
  }

  if (rawData && typeof rawData === 'object' && Array.isArray(rawData.data)) {
    return {
      rows: rawData.data,
      meta: {
        responseShape: 'object.data',
        hasMore: Boolean(rawData.hasMore),
        externalMs: rawData.ms ?? null,
        externalReqId: rawData.reqId || null
      }
    }
  }

  const keys = rawData && typeof rawData === 'object' ? Object.keys(rawData) : []
  throw new Error(`La API externa no devolvió una estructura válida de filas. Claves recibidas: ${keys.join(', ') || '(sin claves)'}.`)
}

export const fetchExternalRows = async (syncConfig: SyncRuntimeConfig, plantel: string, runId: number) => {
  const apiUrl = buildExternalUrl(syncConfig, plantel)
  const headers = buildExternalHeaders(syncConfig)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), syncConfig.timeoutMs)

  try {
    logSyncInfo('Fetching external API.', {
      runId,
      plantel,
      apiHost: new URL(apiUrl).host,
      apiPath: new URL(apiUrl).pathname,
      timeoutMs: syncConfig.timeoutMs
    })

    const startedAt = Date.now()
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal
    })

    const elapsedMs = Date.now() - startedAt

    logSyncInfo('External API responded.', {
      runId,
      plantel,
      status: response.status,
      ok: response.ok,
      elapsedMs
    })

    if (!response.ok) {
      const body = await readExternalErrorBody(response)

      logSyncWarn('External API rejected request.', {
        runId,
        plantel,
        status: response.status,
        statusText: response.statusText,
        responseBodyPreview: body || null
      })

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Error en API externa: ${response.status} ${response.statusText}. Autenticación rechazada por matricula.casitaapps.com.`)
      }

      throw new Error(`Error en API externa: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`)
    }

    const rawData = await response.json()
    const { rows, meta } = extractExternalRows(rawData)

    logSyncInfo('External API payload accepted.', {
      runId,
      plantel,
      rows: rows.length,
      ...meta
    })

    if (meta.hasMore) {
      logSyncWarn('External API reported hasMore=true; current integration expects the no-pagination response.', {
        runId,
        plantel,
        rows: rows.length,
        externalReqId: meta.externalReqId || null
      })
    }

    return rows
  } finally {
    clearTimeout(timeout)
  }
}

export function mapExternalRow(row: any) {
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

export function computeHash(mappedData: any) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(mappedData))
    .digest('hex')
}

export const signExternalRow = (row: any, runId: number, plantel: string, apiKey: string) => {
  const matricula = normalizeMatricula(row?.matricula).toUpperCase()
  const mappedHash = computeHash(mapExternalRow(row))
  const payload = `${runId}|${plantel.toUpperCase()}|${matricula}|${mappedHash}`

  return crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex')
}

export const attachRowSignatures = (rows: any[], runId: number, plantel: string, apiKey: string) => {
  return rows.map(row => ({
    ...row,
    __syncSignature: signExternalRow(row, runId, plantel, apiKey)
  }))
}

export const detachAndVerifySignedRow = (signedRow: any, runId: number, plantel: string, apiKey: string) => {
  const raw = signedRow && typeof signedRow === 'object' ? signedRow : {}
  const { __syncSignature, ...row } = raw
  const signature = String(__syncSignature || '').trim()

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { ok: false, row, reason: 'missing_signature' }
  }

  const expected = signExternalRow(row, runId, plantel, apiKey)
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(signature, 'hex')

  if (expectedBuffer.length !== actualBuffer.length) {
    return { ok: false, row, reason: 'signature_length_mismatch' }
  }

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, row, reason: 'signature_mismatch' }
  }

  return { ok: true, row, reason: '' }
}

export const resolveFinalEstatus = (row: any, localEstatus: string, matricula: string, runId: number, plantel: string) => {
  const externalBaja = row?.baja === 1 || row?.baja === true || String(row?.baja).toLowerCase() === 'true'

  if (externalBaja) {
    return String(row?.motivo_baja || row?.categoria_baja || 'Baja').trim()
  }

  if (localEstatus && localEstatus !== 'Activo') {
    logSyncInfo('Conservative baja preserved.', {
      runId,
      plantel,
      matricula,
      localEstatus
    })
    return localEstatus
  }

  return 'Activo'
}

export const processExternalRowsBatch = async (
  runId: number,
  plantel: string,
  signedRows: any[],
  apiKey: string
): Promise<SyncCounters> => {
  const counters = createEmptyCounters(signedRows.length)
  const seenMatriculas = new Set<string>()
  const validEntries: Array<{
    row: any
    matricula: string
    matriculaKey: string
    mapped: ReturnType<typeof mapExternalRow>
    sourceHash: string
  }> = []

  for (let index = 0; index < signedRows.length; index++) {
    counters.processed++

    const verification = detachAndVerifySignedRow(signedRows[index], runId, plantel, apiKey)
    if (!verification.ok) {
      counters.errors++
      logSyncWarn('Rejected unsigned or modified sync row.', {
        runId,
        plantel,
        rowIndex: index,
        reason: verification.reason
      })
      continue
    }

    const row = verification.row
    const matricula = normalizeMatricula(row?.matricula)
    const matriculaKey = matricula.toUpperCase()

    if (!matricula) {
      counters.errors++
      logSyncWarn('Skipping external row without matrícula.', {
        runId,
        plantel,
        rowIndex: index,
        rowKeys: row ? Object.keys(row).slice(0, 20) : []
      })
      continue
    }

    if (seenMatriculas.has(matriculaKey)) {
      counters.skipped++
      logSyncWarn('Skipping duplicated matrícula inside sync batch.', {
        runId,
        plantel,
        rowIndex: index,
        matricula
      })
      continue
    }

    seenMatriculas.add(matriculaKey)

    const mapped = mapExternalRow(row)
    const sourceHash = computeHash(mapped)

    validEntries.push({
      row,
      matricula,
      matriculaKey,
      mapped,
      sourceHash
    })
  }

  if (validEntries.length === 0) {
    return counters
  }

  const matriculas = validEntries.map(entry => entry.matricula)

  const localRows = await query<any[]>(
    `SELECT matricula, estatus FROM base WHERE matricula IN (?)`,
    [matriculas]
  )

  const metaRows = await query<any[]>(
    `SELECT matricula, source_hash FROM external_base_sync WHERE matricula IN (?)`,
    [matriculas]
  )

  const localByMatricula = new Map(
    localRows.map(row => [String(row.matricula || '').trim().toUpperCase(), row])
  )

  const metaByMatricula = new Map(
    metaRows.map(row => [String(row.matricula || '').trim().toUpperCase(), row])
  )

  const statements: SqlStatement[] = []

  for (const entry of validEntries) {
    const localStudent = localByMatricula.get(entry.matriculaKey)
    const existingMeta = metaByMatricula.get(entry.matriculaKey)

    if (localStudent && existingMeta?.source_hash === entry.sourceHash) {
      counters.skipped++
      continue
    }

    const finalEstatus = resolveFinalEstatus(
      entry.row,
      String(localStudent?.estatus || '').trim(),
      entry.matricula,
      runId,
      plantel
    )

    const fullName = [
      entry.mapped.apellidoPaterno,
      entry.mapped.apellidoMaterno,
      entry.mapped.nombres
    ].filter(Boolean).join(' ').trim() || entry.matricula

    if (localStudent) {
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
          entry.mapped.apellidoPaterno,
          entry.mapped.apellidoMaterno,
          entry.mapped.nombres,
          fullName,
          entry.mapped.nivel,
          entry.mapped.grado,
          entry.mapped.grupo,
          entry.mapped.interno,
          entry.mapped.correo,
          entry.mapped.telefono,
          entry.mapped.padre,
          finalEstatus,
          entry.matricula
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
          entry.matricula,
          plantel,
          entry.mapped.apellidoPaterno,
          entry.mapped.apellidoMaterno,
          entry.mapped.nombres,
          fullName,
          entry.mapped.nivel,
          entry.mapped.grado,
          entry.mapped.grupo,
          entry.mapped.interno,
          entry.mapped.correo,
          entry.mapped.telefono,
          entry.mapped.padre,
          finalEstatus,
          '',
          DEFAULT_SYNC_CICLO
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
      params: [entry.matricula, plantel, entry.sourceHash, JSON.stringify(entry.row)]
    })

    counters.updated++
  }

  if (statements.length > 0) {
    await executeStatementTransaction(statements)
  }

  return counters
}