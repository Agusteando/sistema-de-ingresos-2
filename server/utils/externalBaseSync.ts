import crypto from 'node:crypto'
import { executeStatementTransaction, query, type SqlStatement } from './db'
import { nivelFromPlantel, normalizeGradoForPlantel } from '../../shared/utils/grado'
import { normalizeCicloKey } from '../../shared/utils/ciclo'

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
export const ENROLLMENT_CONFIG_URL = 'https://matricula.casitaapps.com/api/enrollment-config/all'
export const EXTERNAL_SYNC_URL = 'https://matricula.casitaapps.com/api/sync'
export const EXTERNAL_SYNC_TIMEOUT_MS = 60000
export const EXTERNAL_SYNC_STALE_AFTER_MINUTES = 30
export const EXTERNAL_SYNC_BATCH_LIMIT = 50
export const ENROLLMENT_CONFIG_TIMEOUT_MS = 15000
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

const extractSimpleCicloKey = (value: unknown) => {
  const match = String(value || '').trim().match(/\d{4}/)
  return match ? normalizeCicloKey(match[0], match[0]) : ''
}

const requireSimpleCicloKey = (value: unknown, source: string) => {
  const cicloKey = extractSimpleCicloKey(value)
  if (!cicloKey) {
    throw new Error(`No se pudo resolver el ciclo escolar actual desde ${source}.`)
  }

  return cicloKey
}

const isTruthyCurrentFlag = (value: any) => (
  value === true ||
  value === 1 ||
  String(value || '').trim().toLowerCase() === 'true' ||
  String(value || '').trim().toLowerCase() === 'actual' ||
  String(value || '').trim().toLowerCase() === 'vigente'
)

const currentFlagKeys = ['esActual', 'actual', 'current', 'vigente', 'isCurrent', 'active']
const directCicloKeys = [
  'cicloActual',
  'ciclo_actual',
  'currentCiclo',
  'current_ciclo',
  'cicloEscolarActual',
  'ciclo_escolar_actual'
]

const cicloValueKeys = ['ciclo', 'ciclo_escolar', 'cicloEscolar', 'value', 'label', 'nombre']

const readCurrentCicloFromConfig = (configData: any): unknown => {
  if (!configData || typeof configData !== 'object') return ''

  for (const key of directCicloKeys) {
    if (configData[key]) return configData[key]
  }

  const ciclos = configData.ciclos

  if (Array.isArray(ciclos)) {
    const current = ciclos.find((entry) => {
      if (!entry || typeof entry !== 'object') return false
      return currentFlagKeys.some(key => isTruthyCurrentFlag(entry[key]))
    })

    if (current) {
      for (const key of cicloValueKeys) {
        if (current[key]) return current[key]
      }
    }
  }

  if (ciclos && typeof ciclos === 'object') {
    const currentEntry = Object.entries(ciclos).find(([, value]) => {
      if (!value || typeof value !== 'object') return false
      return currentFlagKeys.some(key => isTruthyCurrentFlag((value as any)[key]))
    })

    if (currentEntry) return currentEntry[0]
  }

  return ''
}

export const fetchCurrentEnrollmentCicloKey = async () => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ENROLLMENT_CONFIG_TIMEOUT_MS)

  try {
    const response = await fetch(ENROLLMENT_CONFIG_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Configuracion de ciclo respondio con HTTP ${response.status}.`)
    }

    const configData = await response.json()
    return requireSimpleCicloKey(
      readCurrentCicloFromConfig(configData),
      ENROLLMENT_CONFIG_URL
    )
  } finally {
    clearTimeout(timeout)
  }
}

const normalizePayloadKey = (key: unknown) => String(key || '')
  .toLowerCase()
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '')

const firstPayloadValue = (row: any, aliases: string[]) => {
  if (!row || typeof row !== 'object') return ''

  for (const alias of aliases) {
    const direct = row[alias]
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
      return String(direct).trim()
    }
  }

  const normalizedAliases = new Set(aliases.map(normalizePayloadKey))
  const entry = Object.entries(row).find(([key, value]) => {
    return normalizedAliases.has(normalizePayloadKey(key)) && value !== undefined && value !== null && String(value).trim() !== ''
  })

  return entry ? String(entry[1]).trim() : ''
}

const joinName = (...parts: string[]) => parts.map(part => String(part || '').trim()).filter(Boolean).join(' ').trim()

const normalizeDateValue = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const ymd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymd) {
    const [, year, month, day] = ymd
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmy) {
    const [, day, month, year] = dmy
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return raw
}

const birthFromCurp = (curp: unknown) => {
  const normalized = String(curp || '').trim().toUpperCase()
  const match = normalized.match(/^[A-Z]{4}(\d{2})(\d{2})(\d{2})[HM]/)
  if (!match) return ''

  const yy = Number(match[1])
  const mm = Number(match[2])
  const dd = Number(match[3])
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return ''

  const currentTwoDigitYear = Number(String(new Date().getFullYear()).slice(-2))
  const fullYear = yy <= currentTwoDigitYear + 1 ? 2000 + yy : 1900 + yy
  return `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

const generoFromValue = (value: unknown, curp: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  const curpGender = String(curp || '').trim().toUpperCase().match(/^[A-Z]{4}\d{6}([HM])/)
  const resolved = raw || (curpGender?.[1] === 'H' ? 'masculino' : curpGender?.[1] === 'M' ? 'femenino' : '')

  if (['1', 'h', 'm', 'masculino', 'hombre', 'male'].includes(resolved)) return '1'
  if (['0', 'f', 'femenino', 'mujer', 'female'].includes(resolved)) return '0'
  return '1'
}

const normalizeInscritoBoolean = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  return !(value === false || value === 0 || ['false', '0', 'no', 'externo'].includes(raw))
}

export function mapExternalRow(row: any, plantel: string) {
  const curp = firstPayloadValue(row, ['curp', 'CURP'])
  const tutorFullName = joinName(
    firstPayloadValue(row, ['nombre_tutor', 'tutor_nombre', 'nombreTutor']),
    firstPayloadValue(row, ['apellido_paterno_tutor', 'tutor_apellido_paterno', 'apellidoPaternoTutor']),
    firstPayloadValue(row, ['apellido_materno_tutor', 'tutor_apellido_materno', 'apellidoMaternoTutor'])
  ) || firstPayloadValue(row, ['tutor', 'padre_tutor', 'padreTutor', 'nombre_padre_tutor', 'nombrePadreTutor'])

  const padreFullName = joinName(
    firstPayloadValue(row, ['nombre_padre', 'padre_nombre', 'nombrePadre']),
    firstPayloadValue(row, ['apellido_paterno_padre', 'padre_apellido_paterno', 'apellidoPaternoPadre']),
    firstPayloadValue(row, ['apellido_materno_padre', 'padre_apellido_materno', 'apellidoMaternoPadre'])
  ) || firstPayloadValue(row, ['padre', 'nombre_padre_completo', 'nombrePadreCompleto'])

  const madreFullName = joinName(
    firstPayloadValue(row, ['nombre_madre', 'madre_nombre', 'nombreMadre']),
    firstPayloadValue(row, ['apellido_paterno_madre', 'madre_apellido_paterno', 'apellidoPaternoMadre']),
    firstPayloadValue(row, ['apellido_materno_madre', 'madre_apellido_materno', 'apellidoMaternoMadre'])
  ) || firstPayloadValue(row, ['madre', 'nombre_madre_completo', 'nombreMadreCompleto'])

  const padreTutor = tutorFullName || [padreFullName, madreFullName].filter(Boolean).join(' / ') || 'No especificado'
  const birth = normalizeDateValue(firstPayloadValue(row, [
    'fecha_nacimiento',
    'fecha_de_nacimiento',
    'fechaNacimiento',
    'nacimiento',
    'birth',
    'birthdate'
  ])) || birthFromCurp(curp)

  return {
    apellidoPaterno: firstPayloadValue(row, ['apellido_paterno', 'apellidoPaterno', 'primer_apellido']),
    apellidoMaterno: firstPayloadValue(row, ['apellido_materno', 'apellidoMaterno', 'segundo_apellido']),
    nombres: firstPayloadValue(row, ['nombres', 'nombre', 'nombre_alumno', 'nombreAlumno']),
    nivel: nivelFromPlantel(plantel),
    grado: normalizeGradoForPlantel(firstPayloadValue(row, ['grado', 'grado_actual', 'gradoActual']) || 'Primero', plantel),
    grupo: firstPayloadValue(row, ['grupo', 'grupo_actual', 'grupoActual']) || 'A',
    interno: normalizeInscritoBoolean(firstPayloadValue(row, ['interno', 'tipo_ingreso', 'tipoIngreso'])) ? 1 : 0,
    correo: firstPayloadValue(row, [
      'email_tutor',
      'correo_tutor',
      'email_padre',
      'correo_padre',
      'email_madre',
      'correo_madre',
      'correo',
      'email'
    ]),
    telefono: firstPayloadValue(row, [
      'telefono_tutor',
      'celular_tutor',
      'telefono_padre',
      'celular_padre',
      'telefono_madre',
      'celular_madre',
      'telefono',
      'celular'
    ]),
    padre: padreTutor,
    birth,
    genero: generoFromValue(firstPayloadValue(row, ['genero', 'sexo']), curp),
    curp,
    matriculaAnterior: normalizeMatricula(firstPayloadValue(row, [
      'matricula_anterior',
      'matriculaAnterior',
      'previous_matricula',
      'previousMatricula',
      'matricula_previa',
      'matriculaPrevia'
    ])),
    matriculaSiguiente: normalizeMatricula(firstPayloadValue(row, [
      'matricula_siguiente',
      'matriculaSiguiente',
      'successor_matricula',
      'successorMatricula',
      'nueva_matricula',
      'nuevaMatricula'
    ])),
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

export const signExternalRow = (row: any, runId: number, plantel: string, apiKey: string, syncCicloKey: string) => {
  const cicloKey = requireSimpleCicloKey(syncCicloKey, 'la sincronizacion actual')
  const matricula = normalizeMatricula(row?.matricula || firstPayloadValue(row, ['matricula', 'matricula_alumno', 'matriculaAlumno'])).toUpperCase()
  const mappedHash = computeHash({ raw: row, mapped: mapExternalRow(row, plantel) })
  const payload = `${runId}|${plantel.toUpperCase()}|${matricula}|${cicloKey}|${mappedHash}`

  return crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex')
}

export const attachRowSignatures = (rows: any[], runId: number, plantel: string, apiKey: string, syncCicloKey: string) => {
  const cicloKey = requireSimpleCicloKey(syncCicloKey, 'la sincronizacion actual')

  return rows.map(row => ({
    ...row,
    __syncCiclo: cicloKey,
    __syncSignature: signExternalRow(row, runId, plantel, apiKey, cicloKey)
  }))
}

export const detachAndVerifySignedRow = (signedRow: any, runId: number, plantel: string, apiKey: string) => {
  const raw = signedRow && typeof signedRow === 'object' ? signedRow : {}
  const { __syncSignature, __syncCiclo, ...row } = raw
  const signature = String(__syncSignature || '').trim()
  const cicloKey = extractSimpleCicloKey(__syncCiclo)

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { ok: false, row, reason: 'missing_signature' }
  }

  if (!cicloKey) {
    return { ok: false, row, reason: 'missing_sync_ciclo' }
  }

  const expected = signExternalRow(row, runId, plantel, apiKey, cicloKey)
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(signature, 'hex')

  if (expectedBuffer.length !== actualBuffer.length) {
    return { ok: false, row, reason: 'signature_length_mismatch' }
  }

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, row, reason: 'signature_mismatch' }
  }

  return { ok: true, row, reason: '', cicloKey }
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
    syncCicloKey: string
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
    const syncCicloKey = requireSimpleCicloKey(verification.cicloKey, 'el lote de sincronizacion firmado')
    const matricula = normalizeMatricula(row?.matricula || firstPayloadValue(row, ['matricula', 'matricula_alumno', 'matriculaAlumno']))
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

    const mapped = mapExternalRow(row, plantel)
    const sourceHash = computeHash({ raw: row, mapped })

    validEntries.push({
      row,
      matricula,
      matriculaKey,
      syncCicloKey,
      mapped,
      sourceHash
    })
  }

  if (validEntries.length === 0) {
    return counters
  }

  const matriculas = validEntries.map(entry => entry.matricula)

  const localRows = await query<any[]>(
    `
      SELECT
        matricula,
        estatus,
        apellidoPaterno,
        apellidoMaterno,
        nombres,
        correo,
        telefono,
        \`Nombre del padre o tutor\` AS padre,
        \`Fecha de nacimiento\` AS birth,
        genero,
        ciclo
      FROM base
      WHERE matricula IN (?)
    `,
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
    const localCicloNeedsRefresh = Boolean(localStudent) && String(localStudent?.ciclo || '').trim() !== entry.syncCicloKey
    const localMissingMappedField = Boolean(localStudent) && [
      ['apellidoPaterno', entry.mapped.apellidoPaterno],
      ['apellidoMaterno', entry.mapped.apellidoMaterno],
      ['nombres', entry.mapped.nombres],
      ['correo', entry.mapped.correo],
      ['telefono', entry.mapped.telefono],
      ['padre', entry.mapped.padre],
      ['birth', entry.mapped.birth],
      ['genero', entry.mapped.genero]
    ].some(([field, mappedValue]) => {
      return String(mappedValue || '').trim() !== '' && String(localStudent?.[field] || '').trim() === ''
    })

    if (localStudent && existingMeta?.source_hash === entry.sourceHash && !localMissingMappedField && !localCicloNeedsRefresh) {
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
    ].filter(Boolean).join(' ').trim()
    const fullNameForInsert = fullName || entry.matricula

    if (localStudent) {
      statements.push({
        sql: `
          UPDATE base SET
            apellidoPaterno = COALESCE(NULLIF(?, ''), apellidoPaterno),
            apellidoMaterno = COALESCE(NULLIF(?, ''), apellidoMaterno),
            nombres = COALESCE(NULLIF(?, ''), nombres),
            nombreCompleto = COALESCE(NULLIF(?, ''), nombreCompleto),
            nivel = ?,
            grado = ?,
            grupo = COALESCE(NULLIF(?, ''), grupo),
            interno = ?,
            correo = COALESCE(NULLIF(?, ''), correo),
            telefono = COALESCE(NULLIF(?, ''), telefono),
            \`Nombre del padre o tutor\` = COALESCE(NULLIF(?, ''), \`Nombre del padre o tutor\`),
            \`Fecha de nacimiento\` = COALESCE(NULLIF(?, ''), \`Fecha de nacimiento\`),
            genero = COALESCE(NULLIF(?, ''), genero),
            ciclo = ?,
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
          entry.mapped.birth,
          entry.mapped.genero,
          entry.syncCicloKey,
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
            genero,
            ciclo,
            usuario
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sistema Sync')
        `,
        params: [
          entry.matricula,
          plantel,
          entry.mapped.apellidoPaterno,
          entry.mapped.apellidoMaterno,
          entry.mapped.nombres,
          fullNameForInsert,
          entry.mapped.nivel,
          entry.mapped.grado,
          entry.mapped.grupo,
          entry.mapped.interno,
          entry.mapped.correo,
          entry.mapped.telefono,
          entry.mapped.padre,
          finalEstatus,
          entry.mapped.birth,
          entry.mapped.genero,
          entry.syncCicloKey
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
      params: [entry.matricula, plantel, entry.sourceHash, JSON.stringify({ raw: entry.row, mapped: entry.mapped, syncCiclo: entry.syncCicloKey })]
    })

    const previousMatricula = normalizeMatricula(entry.mapped.matriculaAnterior)
    const successorMatricula = normalizeMatricula(entry.mapped.matriculaSiguiente)

    if (previousMatricula && previousMatricula.toUpperCase() !== entry.matriculaKey) {
      statements.push({
        sql: `DELETE FROM alumno_matricula_links WHERE previous_matricula = ? OR successor_matricula = ?`,
        params: [previousMatricula, entry.matricula]
      })
      statements.push({
        sql: `
          INSERT INTO alumno_matricula_links (previous_matricula, successor_matricula)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            successor_matricula = VALUES(successor_matricula),
            updated_at = CURRENT_TIMESTAMP
        `,
        params: [previousMatricula, entry.matricula]
      })
    }

    if (successorMatricula && successorMatricula.toUpperCase() !== entry.matriculaKey) {
      statements.push({
        sql: `DELETE FROM alumno_matricula_links WHERE previous_matricula = ? OR successor_matricula = ?`,
        params: [entry.matricula, successorMatricula]
      })
      statements.push({
        sql: `
          INSERT INTO alumno_matricula_links (previous_matricula, successor_matricula)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            successor_matricula = VALUES(successor_matricula),
            updated_at = CURRENT_TIMESTAMP
        `,
        params: [entry.matricula, successorMatricula]
      })
    }

    counters.updated++
  }

  if (statements.length > 0) {
    await executeStatementTransaction(statements)
  }

  return counters
}
