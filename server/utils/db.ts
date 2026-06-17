import { AsyncLocalStorage } from 'node:async_hooks'
import mysql, { type PoolConnection } from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { FAMILY_ID_PLACEHOLDER_VALUES } from '../../shared/utils/familyIdentity'
import {
  findBridgeErrorPayload,
  findBridgeTransactionResults,
  normalizeBridgeQueryResult,
  type BridgeErrorResponse,
  type BridgeQueryResponse
} from './db-bridge-contract'

const sqlStringLiteral = (value: string) => `'${String(value).replace(/'/g, "''")}'`
const FAMILY_ID_PLACEHOLDER_SQL_LIST = FAMILY_ID_PLACEHOLDER_VALUES.map(sqlStringLiteral).join(', ')
const INVALID_FAMILY_LINK_KEY_SQL = `
  LOWER(TRIM(CAST(family_key AS CHAR))) IN (${FAMILY_ID_PLACEHOLDER_SQL_LIST})
  OR (LOCATE(':', family_key) > 0 AND LOWER(TRIM(SUBSTRING(family_key, LOCATE(':', family_key) + 1))) IN (${FAMILY_ID_PLACEHOLDER_SQL_LIST}))
  OR TRIM(CAST(family_key AS CHAR)) = ''
`

type DbTransport = 'direct' | 'bridge'
type SqlParams = any[] | Record<string, any>

type RuntimeDbConfig = {
  dbTransport?: string
  dbBridgeUrl?: string
  dbBridgeToken?: string
  dbBridgeTimeoutMs?: string | number
  dbBridgeAgentId?: string
  dbBridgeAgentIdCookie?: string
  dbBridgeAutoMigrateOnStartup?: string | boolean

  mysqlHost?: string
  mysqlPort?: string | number
  mysqlUser?: string
  mysqlPassword?: string
  mysqlDatabase?: string
}

type BridgeAgentContext = {
  agentId?: string
}

type BridgeFetchOptions = {
  timeoutMs?: number
}

export type BridgeAgentAvailability = {
  agentId: string
  online: boolean
  status: 'online' | 'offline' | 'unknown'
  code?: string | null
  httpStatus?: number | null
  message: string
  action?: string
}

export type SqlStatement = {
  sql: string
  params?: SqlParams
}

type EnsureSchemaOptions = {
  allowBridge?: boolean
}

const DB_BRIDGE_PROTOCOL_VERSION = '3.0'

let pool: mysql.Pool
const ensuredSchemaKeys = new Set<string>()
const schemaPromises = new Map<string, Promise<void>>()
const schemaRepairPromises = new Map<string, Promise<void>>()
const bridgeAgentContext = new AsyncLocalStorage<BridgeAgentContext>()

export const enterBridgeAgentId = (agentId: string | undefined | null) => {
  const normalized = String(agentId || '').trim()

  if (normalized) {
    bridgeAgentContext.enterWith({ agentId: normalized })
  }
}

export const runWithBridgeAgentId = async <T>(
  agentId: string | undefined | null,
  callback: () => Promise<T>
): Promise<T> => {
  const normalized = String(agentId || bridgeAgentContext.getStore()?.agentId || '').trim()
  return await bridgeAgentContext.run({ agentId: normalized }, callback)
}

const getRuntimeDbConfig = () => useRuntimeConfig() as unknown as RuntimeDbConfig

const isBridgeDebugEnabled = () => {
  return String(process.env.DEBUG_DB_BRIDGE || '').toLowerCase() === 'true'
}

const debugBridge = (message: string, payload?: Record<string, any>) => {
  if (!isBridgeDebugEnabled()) return
  console.info(`[DB Bridge Debug] ${message}`, payload || {})
}

const getTransport = (): DbTransport => {
  const config = getRuntimeDbConfig()
  return String(config.dbTransport || 'direct').toLowerCase() === 'bridge' ? 'bridge' : 'direct'
}

export const getDbTransport = () => getTransport()

const getConfiguredBridgeAgentId = () => {
  const config = getRuntimeDbConfig()
  return String(config.dbBridgeAgentId || '').trim()
}

const getRequestContextBridgeAgentId = () => {
  try {
    const event = useRequestEvent()
    const contextAgentId = String(event?.context?.dbBridgeAgentId || '').trim()

    if (contextAgentId && contextAgentId !== 'GLOBAL') {
      return contextAgentId
    }
  } catch (e) {}

  return ''
}

export const getBridgeAgentId = () => {
  const asyncContextAgentId = String(bridgeAgentContext.getStore()?.agentId || '').trim()

  if (asyncContextAgentId && asyncContextAgentId !== 'GLOBAL') {
    debugBridge('agent resolved from async context', { agentId: asyncContextAgentId })
    return asyncContextAgentId
  }

  const requestContextAgentId = getRequestContextBridgeAgentId()

  if (requestContextAgentId) {
    debugBridge('agent resolved from request context', { agentId: requestContextAgentId })
    return requestContextAgentId
  }

  const configuredAgentId = getConfiguredBridgeAgentId()

  if (configuredAgentId) {
    debugBridge('agent resolved from DB_BRIDGE_AGENT_ID fallback', { agentId: configuredAgentId })
    return configuredAgentId
  }

  throw new Error('No DB bridge agent selected. Provide DB_BRIDGE_AGENT_ID or call enterBridgeAgentId/runWithBridgeAgentId before database access.')
}

const getSchemaStateKey = () => {
  if (getTransport() === 'bridge') {
    return `bridge:${getBridgeAgentId()}`
  }

  const config = getRuntimeDbConfig()
  return `direct:${config.mysqlHost || 'localhost'}:${config.mysqlDatabase || 'sistema_ingresos'}`
}

const getBridgeBaseUrl = () => {
  const config = getRuntimeDbConfig()
  const url = String(config.dbBridgeUrl || '').trim().replace(/\/+$/, '')

  if (!url) {
    throw new Error('DB_BRIDGE_URL no esta configurado.')
  }

  return url
}

const getBridgeTimeoutMs = () => {
  const config = getRuntimeDbConfig()
  const raw = Number(config.dbBridgeTimeoutMs || 45000)
  return Number.isFinite(raw) && raw > 0 ? raw : 45000
}

const bridgeAgentFromPath = (path: string) => {
  const match = String(path || '').match(/^\/agents\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const attachBridgeDiagnostic = (error: any, path: string) => {
  let event: any = null
  try { event = useRequestEvent() } catch {}

  const upstreamStatus = Number(error?.httpStatus || error?.statusCode || error?.status || 503) || 503
  const status = upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502
  const agentId = bridgeAgentFromPath(path) || String(event?.context?.dbBridgeAgentId || '').trim()
  const activePlantelCookie = event ? getCookie(event, 'auth_active_plantel') : ''
  const diagnostic = {
    requestId: String(event?.context?.auroraRequestId || '').trim(),
    code: String(error?.code || `DB_BRIDGE_HTTP_${upstreamStatus}`),
    source: String(error?.source || error?.bridgePayload?.source || (String(error?.code || '').startsWith('ER_') ? 'agent_mysql' : 'db_bridge')),
    status,
    upstreamStatus,
    plantel: String(event?.context?.user?.active_plantel || activePlantelCookie || agentId || '').trim(),
    agentId,
    retryable: [502, 503, 504].includes(status),
    protocolVersion: String(error?.bridgePayload?.protocolVersion || DB_BRIDGE_PROTOCOL_VERSION),
    upstreamRequestId: String(error?.upstreamRequestId || '').trim(),
    upstreamBody: String(error?.bridgeResponseText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    message: String(error?.message || BRIDGE_AGENT_UNAVAILABLE_MESSAGE).replace(/\s+/g, ' ').trim().slice(0, 500)
  }

  // Plain Error instances are sanitized by H3 in production and arrive at the
  // browser as an opaque "Server Error". Convert every bridge failure into an
  // H3 error so the bounded diagnostic survives serialization.
  const wrapped: any = createError({
    statusCode: status,
    statusMessage: 'DB bridge request failed',
    message: diagnostic.message,
    data: { diagnostic }
  })
  wrapped.code = diagnostic.code
  wrapped.httpStatus = upstreamStatus
  wrapped.diagnostic = diagnostic
  wrapped.bridgePayload = error?.bridgePayload
  wrapped.cause = error
  return wrapped
}

export const BRIDGE_AGENT_UNAVAILABLE_MESSAGE = 'La base del plantel no está disponible en este momento. Solicita al Administrador verificar la conectividad del equipo del plantel e inténtalo nuevamente.'

const getBridgeErrorText = (error: any) => [
  error?.bridgePayload?.error?.message,
  error?.bridgePayload?.message,
  error?.bridgeResponseText,
  error?.data?.message,
  error?.statusMessage,
  error?.message,
  error?.code,
  error?.name
].filter(Boolean).join(' ')

export const isBridgeAgentUnavailableError = (error: any) => {
  const httpStatus = Number(error?.httpStatus || error?.statusCode || error?.status || error?.response?.status || 0)
  const code = String(error?.code || '').toUpperCase()
  const text = getBridgeErrorText(error)
  const bridgeScoped = code.startsWith('DB_BRIDGE_') || /bridge|agent|base|plantel|conectividad/i.test(text)

  if (code === 'DB_BRIDGE_TIMEOUT' || code === 'DB_BRIDGE_NETWORK') return true
  if (code.startsWith('DB_BRIDGE_HTTP_') && [502, 503, 504].includes(httpStatus)) return true
  if ([502, 503, 504].includes(httpStatus) && bridgeScoped) return true

  return bridgeScoped && /agent\s+'?[^']+'?\s+is\s+offline|agent.*offline|offline|not\s+online|unavailable|fuera\s+de\s+l[ií]nea|no\s+est[aá]\s+disponible|ECONNREFUSED|fetch\s+failed|AbortError|aborted|timed?\s*out/i.test(text)
}

const makeBridgeError = (payload: BridgeErrorResponse, fallbackStatus?: number) => {
  const err: any = new Error(payload.error?.message || payload.message || `DB bridge error${fallbackStatus ? ` (${fallbackStatus})` : ''}`)
  err.code = payload.error?.code || payload.code || (fallbackStatus ? `DB_BRIDGE_HTTP_${fallbackStatus}` : undefined)
  err.errno = payload.error?.errno
  err.sqlState = payload.error?.sqlState
  err.httpStatus = fallbackStatus
  err.bridgePayload = payload
  return err
}

const makeBridgeHttpError = (
  status: number,
  payload: any,
  responseText = '',
  upstreamRequestId = ''
) => {
  const textDetail = String(responseText || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  const bridgeMessage = payload?.error?.message || payload?.message || textDetail
  const suffix = bridgeMessage ? `: ${bridgeMessage}` : ' sin detalle del servicio'
  const err: any = new Error(`DB bridge respondió con HTTP ${status}${suffix}. La operación no fue confirmada; revisa el relay y el agente de base.`)
  err.code = payload?.error?.code || payload?.code || `DB_BRIDGE_HTTP_${status}`
  err.httpStatus = status
  err.statusCode = status >= 400 && status < 600 ? status : 500
  err.bridgePayload = payload
  err.bridgeResponseText = textDetail
  err.upstreamRequestId = upstreamRequestId
  err.source = payload?.source || (String(err.code).startsWith('ER_') ? 'agent_mysql' : 'db_bridge')
  return err
}

const bridgeFetch = async <T>(path: string, body?: unknown, options: BridgeFetchOptions = {}): Promise<T> => {
  const config = getRuntimeDbConfig()
  const url = `${getBridgeBaseUrl()}${path}`
  const controller = new AbortController()
  const timeoutMs = Number(options.timeoutMs || getBridgeTimeoutMs())
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let event: any = null
  try { event = useRequestEvent() } catch {}
  const requestId = String(event?.context?.auroraRequestId || '').trim()

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-DB-Bridge-Protocol': DB_BRIDGE_PROTOCOL_VERSION
    }

    if (requestId) headers['X-Aurora-Request-Id'] = requestId

    if (config.dbBridgeToken) {
      headers.Authorization = `Bearer ${config.dbBridgeToken}`
    }

    debugBridge('fetch bridge request', { url, requestId, protocolVersion: DB_BRIDGE_PROTOCOL_VERSION })

    let response

    try {
      response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers,
        // Keep the established HTTP relay body shape. The agent accepts both
        // root and nested payloads, but Aurora does not require the relay to
        // tolerate additional JSON properties.
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError'
      const err: any = new Error(isTimeout
        ? `DB bridge no respondió antes de ${timeoutMs}ms. Revisa que el bridge y el agente del plantel estén disponibles.`
        : `DB bridge no pudo conectarse con el agente del plantel: ${error?.message || 'conexión no disponible'}.`)
      err.code = isTimeout ? 'DB_BRIDGE_TIMEOUT' : 'DB_BRIDGE_NETWORK'
      err.httpStatus = isTimeout ? 504 : 503
      err.statusCode = err.httpStatus
      throw attachBridgeDiagnostic(err, path)
    }

    const responseText = await response.text().catch(() => '')
    let payload: any = null
    if (responseText) {
      try { payload = JSON.parse(responseText) } catch {}
    }
    const upstreamRequestId = String(
      response.headers.get('x-db-relay-request-id') ||
      response.headers.get('x-aurora-request-id') ||
      response.headers.get('x-request-id') ||
      response.headers.get('x-correlation-id') ||
      response.headers.get('cf-ray') ||
      ''
    ).trim()

    debugBridge('fetch bridge response', {
      url,
      requestId,
      upstreamRequestId,
      status: response.status,
      ok: response.ok,
      payloadOk: payload?.ok,
      responseBytes: Buffer.byteLength(responseText || '')
    })

    if (!response.ok || !payload) {
      throw attachBridgeDiagnostic(
        makeBridgeHttpError(response.status, payload, responseText, upstreamRequestId),
        path
      )
    }

    const errorPayload = findBridgeErrorPayload(payload)
    if (errorPayload) {
      const error = makeBridgeError(errorPayload, response.status)
      error.upstreamRequestId = upstreamRequestId
      throw attachBridgeDiagnostic(error, path)
    }

    return payload as T
  } finally {
    clearTimeout(timeout)
  }
}


export const checkBridgeAgentAvailability = async (
  agentId: string,
  options: { timeoutMs?: number } = {}
): Promise<BridgeAgentAvailability> => {
  const normalizedAgentId = String(agentId || '').trim().toUpperCase()

  if (!normalizedAgentId) {
    return {
      agentId: '',
      online: false,
      status: 'unknown',
      code: 'MISSING_AGENT_ID',
      httpStatus: null,
      message: 'No se pudo identificar el plantel.'
    }
  }

  if (getTransport() !== 'bridge') {
    return {
      agentId: normalizedAgentId,
      online: true,
      status: 'online',
      code: null,
      httpStatus: null,
      message: 'Este equipo está en línea.'
    }
  }

  try {
    await bridgeFetch<BridgeQueryResponse>(`/agents/${encodeURIComponent(normalizedAgentId)}/query`, {
      sql: 'SELECT 1 AS online',
      params: []
    }, {
      timeoutMs: options.timeoutMs || 1800
    })

    return {
      agentId: normalizedAgentId,
      online: true,
      status: 'online',
      code: null,
      httpStatus: null,
      message: 'Este equipo está en línea.'
    }
  } catch (error: any) {
    const unavailable = isBridgeAgentUnavailableError(error)
    const httpStatus = Number(error?.httpStatus || error?.statusCode || error?.status || error?.response?.status || 0) || null

    return {
      agentId: normalizedAgentId,
      online: false,
      status: unavailable ? 'offline' : 'unknown',
      code: error?.code || null,
      httpStatus,
      message: unavailable ? 'Este equipo está fuera de línea.' : 'No se pudo verificar la conectividad en este momento.',
      action: unavailable ? 'Solicita al Administrador verificar la conectividad.' : 'Intenta verificar nuevamente en unos segundos.'
    }
  }
}

export const getDb = () => {
  if (getTransport() === 'bridge') {
    throw new Error('getDb() no esta disponible con DB_TRANSPORT=bridge. Usa query() o executeStatementTransaction().')
  }

  if (!pool) {
    const config = getRuntimeDbConfig()
    pool = mysql.createPool({
      host: config.mysqlHost || 'localhost',
      port: Number(config.mysqlPort || 3306),
      user: config.mysqlUser || 'root',
      password: config.mysqlPassword || '',
      database: config.mysqlDatabase || 'sistema_ingresos',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    })
  }

  return pool
}

const directQuery = async <T>(sql: string, params?: SqlParams): Promise<T> => {
  const db = getDb()
  const [rows] = await db.query(sql, params as never)
  return rows as T
}

const bridgeQuery = async <T>(sql: string, params?: SqlParams): Promise<T> => {
  const agentId = getBridgeAgentId()

  const payload = await bridgeFetch<BridgeQueryResponse>(`/agents/${encodeURIComponent(agentId)}/query`, {
    sql,
    params: params || []
  })

  return normalizeBridgeQueryResult<T>(payload)
}

const rawQuery = async <T>(sql: string, params?: SqlParams): Promise<T> => {
  if (getTransport() === 'bridge') {
    return await bridgeQuery<T>(sql, params)
  }

  return await directQuery<T>(sql, params)
}

const runSafeQuery = async (sql: string) => {
  try {
    await rawQuery(sql)
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_KEYNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.error(`[Schema Update Error] ${sql.substring(0, 50)}... ->`, err.message)
    }
  }
}

const runOptionalIndexQuery = async (sql: string) => {
  if (getTransport() === 'bridge') {
    debugBridge('skip optional index migration through bridge', { sql: sql.replace(/\s+/g, ' ').trim() })
    return
  }

  await runSafeQuery(sql)
}

const checkAndAddColumn = async (table: string, column: string, definition: string, defaultAction?: string) => {
  try {
    const cols = await rawQuery<any[]>(`SHOW COLUMNS FROM ${table} LIKE '${column}'`)

    if (cols.length === 0) {
      await rawQuery(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)

      if (defaultAction) {
        try {
          await rawQuery(defaultAction)
        } catch (e) {}
      }
    }
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      console.error(`[Schema Update Error] No se pudo agregar la columna ${column} a ${table}:`, err.message)
      throw err
    }
  }
}

export const ensureSchema = async (options: EnsureSchemaOptions = {}) => {
  // En bridge mode, schema migrations must never be coupled to a normal user
  // request. A ROLE_ADMON login selects a concrete plantel and immediately
  // opens several financial endpoints; running the full migration sequence in
  // that request context can retain hundreds of bridge responses and exhaust
  // the Nuxt process heap. Bridge migrations are allowed only from the explicit
  // startup path, which passes allowBridge=true.
  if (getTransport() === 'bridge' && !options.allowBridge) return

  const schemaKey = getSchemaStateKey()

  if (ensuredSchemaKeys.has(schemaKey)) return

  if (!schemaPromises.has(schemaKey)) {
    const schemaPromise = (async () => {
      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS facturas (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          matricula VARCHAR(50) NOT NULL,
          rfc VARCHAR(20) NOT NULL,
          razonSocial VARCHAR(255) NOT NULL,
          regimenFiscal VARCHAR(10) DEFAULT NULL,
          usoCfdi VARCHAR(10) DEFAULT NULL,
          cp VARCHAR(10) DEFAULT NULL,
          correo VARCHAR(255) DEFAULT NULL,
          total DECIMAL(10,2) NOT NULL,
          folios TEXT NOT NULL,
          fecha DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS familias (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          apellidos VARCHAR(255) NOT NULL,
          tutor VARCHAR(255) NOT NULL,
          telefono VARCHAR(255) DEFAULT NULL,
          correo VARCHAR(255) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS users (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) NOT NULL,
          password VARCHAR(255) NOT NULL,
          plantel VARCHAR(255) DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS external_base_sync (
          matricula VARCHAR(255) PRIMARY KEY,
          plantel VARCHAR(255) NOT NULL,
          source_hash VARCHAR(64) NOT NULL,
          last_synced_at DATETIME NOT NULL,
          last_payload JSON NULL,
          last_error TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS external_sync_runs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          plantel VARCHAR(255) NOT NULL,
          status VARCHAR(30) NOT NULL,
          started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finished_at DATETIME NULL,
          total_rows INT DEFAULT 0,
          processed_rows INT DEFAULT 0,
          updated_rows INT DEFAULT 0,
          skipped_rows INT DEFAULT 0,
          error_rows INT DEFAULT 0,
          cancelled TINYINT(1) DEFAULT 0,
          message TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS config_school_cycles (
          cycle_name VARCHAR(20) NOT NULL PRIMARY KEY,
          is_current TINYINT(1) NOT NULL DEFAULT 0,
          sync_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
          updated_by VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_config_school_cycles_current (is_current)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS config_enrollment_mappings (
          id INT NOT NULL PRIMARY KEY,
          cycle_name VARCHAR(20) NOT NULL,
          plantel VARCHAR(40) NOT NULL,
          concepto_id INT NOT NULL DEFAULT 0,
          concepto_nombre VARCHAR(255) NOT NULL,
          enrollment_type VARCHAR(80) NOT NULL DEFAULT 'regular',
          months_json TEXT NULL,
          servicio_clave VARCHAR(120) DEFAULT NULL,
          servicio_nombre VARCHAR(160) DEFAULT NULL,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          sync_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
          updated_by VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_config_enrollment_scope (cycle_name, plantel, enrollment_type, activo),
          INDEX idx_config_enrollment_concepto (concepto_id),
          INDEX idx_config_enrollment_servicio (servicio_clave, activo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS talleres_servicios_catalogo (
          servicio_clave VARCHAR(120) NOT NULL PRIMARY KEY,
          servicio_nombre VARCHAR(160) NOT NULL,
          imagen_url VARCHAR(255) DEFAULT NULL,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          orden INT NOT NULL DEFAULT 9999,
          sync_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
          updated_by VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_talleres_servicios_activo_orden (activo, orden)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS alumno_matricula_links (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          previous_matricula VARCHAR(255) NOT NULL,
          successor_matricula VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_previous_matricula (previous_matricula),
          UNIQUE KEY uniq_successor_matricula (successor_matricula),
          INDEX idx_matricula_link_pair (previous_matricula, successor_matricula)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS student_custom_sections (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          plantel VARCHAR(255) NOT NULL DEFAULT 'global',
          description VARCHAR(255) DEFAULT NULL,
          color VARCHAR(32) DEFAULT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_student_custom_section_scope_name (plantel(64), name),
          INDEX idx_student_custom_sections_scope (plantel(64), is_active, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS student_custom_section_memberships (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          section_id INT NOT NULL,
          matricula VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(255) DEFAULT NULL,
          UNIQUE KEY uniq_student_custom_section_member (section_id, matricula),
          INDEX idx_student_custom_section_member_matricula (matricula(64)),
          CONSTRAINT fk_student_custom_section_member_section
            FOREIGN KEY (section_id) REFERENCES student_custom_sections(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS student_family_links (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          family_key VARCHAR(255) NOT NULL,
          matricula VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_student_family_member (matricula),
          INDEX idx_student_family_key (family_key(64))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS student_tipo_ingreso_overrides (
          matricula VARCHAR(255) NOT NULL PRIMARY KEY,
          override_activo TINYINT(1) NOT NULL DEFAULT 0,
          tipo_forzado VARCHAR(20) NOT NULL DEFAULT 'externo',
          updated_by VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_student_tipo_ingreso_override_estado (override_activo, tipo_forzado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        DELETE FROM student_family_links
        WHERE ${INVALID_FAMILY_LINK_KEY_SQL}
      `)


      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS documento_concepto_periodos (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          documento INT NOT NULL,
          start_mes INT NOT NULL DEFAULT 1,
          end_mes INT DEFAULT NULL,
          concepto_id INT DEFAULT NULL,
          conceptoNombre VARCHAR(255) DEFAULT NULL,
          costo DECIMAL(65,2) DEFAULT NULL,
          montoFinal DECIMAL(65,2) DEFAULT NULL,
          accion VARCHAR(30) NOT NULL DEFAULT 'cambio',
          estatus VARCHAR(30) NOT NULL DEFAULT 'Activo',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(255) DEFAULT NULL,
          payment_policy VARCHAR(40) NOT NULL DEFAULT 'mantener_pagos_existentes',
          diferencia_monto DECIMAL(65,2) NOT NULL DEFAULT 0,
          diferencial_documento INT DEFAULT NULL,
          INDEX idx_documento_periodo (documento, start_mes, end_mes, estatus),
          INDEX idx_documento_periodo_diferencial (diferencial_documento)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS documento_monto_correcciones (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          documento INT NOT NULL,
          matricula VARCHAR(255) NOT NULL,
          ciclo VARCHAR(50) DEFAULT NULL,
          monto_anterior DECIMAL(65,2) NOT NULL DEFAULT 0,
          monto_nuevo DECIMAL(65,2) NOT NULL DEFAULT 0,
          mensualidades_afectadas INT NOT NULL DEFAULT 0,
          pago_maximo_mensual DECIMAL(65,2) NOT NULL DEFAULT 0,
          pagos_totales DECIMAL(65,2) NOT NULL DEFAULT 0,
          periodos_actualizados INT NOT NULL DEFAULT 0,
          motivo VARCHAR(80) NOT NULL,
          detalle_anterior LONGTEXT DEFAULT NULL,
          usuario VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_documento_monto_correcciones_documento (documento, created_at),
          INDEX idx_documento_monto_correcciones_matricula (matricula(64), ciclo(20))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS documento_concepto_correcciones (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          documento INT NOT NULL,
          matricula VARCHAR(255) NOT NULL,
          ciclo VARCHAR(50) DEFAULT NULL,
          concepto_anterior INT DEFAULT NULL,
          concepto_nombre_anterior VARCHAR(255) DEFAULT NULL,
          concepto_nuevo INT NOT NULL,
          concepto_nombre_nuevo VARCHAR(255) NOT NULL,
          referencias_afectadas INT NOT NULL DEFAULT 0,
          folios_afectados TEXT DEFAULT NULL,
          usuario VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_documento_concepto_correcciones_documento (documento, created_at),
          INDEX idx_documento_concepto_correcciones_matricula (matricula(64), ciclo(20))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'config_enrollment_mappings'`)

        if (tables.length > 0) {
          await checkAndAddColumn('config_enrollment_mappings', 'enrollment_type', "VARCHAR(80) NOT NULL DEFAULT 'regular'")
          await checkAndAddColumn('config_enrollment_mappings', 'months_json', "TEXT NULL")
          await checkAndAddColumn('config_enrollment_mappings', 'servicio_clave', "VARCHAR(120) DEFAULT NULL")
          await checkAndAddColumn('config_enrollment_mappings', 'servicio_nombre', "VARCHAR(160) DEFAULT NULL")
          await checkAndAddColumn('config_enrollment_mappings', 'activo', "TINYINT(1) NOT NULL DEFAULT 1")
          await checkAndAddColumn('config_enrollment_mappings', 'sync_version', "BIGINT UNSIGNED NOT NULL DEFAULT 1")
          await checkAndAddColumn('config_enrollment_mappings', 'updated_by', "VARCHAR(255) DEFAULT NULL")
          await checkAndAddColumn('config_enrollment_mappings', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
          await checkAndAddColumn('config_enrollment_mappings', 'updated_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
          await runOptionalIndexQuery(`ALTER TABLE config_enrollment_mappings ADD INDEX idx_config_enrollment_scope (cycle_name, plantel, enrollment_type, activo)`)
          await runOptionalIndexQuery(`ALTER TABLE config_enrollment_mappings ADD INDEX idx_config_enrollment_servicio (servicio_clave, activo)`)
        }
      } catch (e) {}

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'talleres_servicios_catalogo'`)
        if (tables.length > 0) {
          await checkAndAddColumn('talleres_servicios_catalogo', 'imagen_url', "VARCHAR(255) DEFAULT NULL")
          await checkAndAddColumn('talleres_servicios_catalogo', 'activo', "TINYINT(1) NOT NULL DEFAULT 1")
          await checkAndAddColumn('talleres_servicios_catalogo', 'orden', "INT NOT NULL DEFAULT 9999")
          await checkAndAddColumn('talleres_servicios_catalogo', 'sync_version', "BIGINT UNSIGNED NOT NULL DEFAULT 1")
          await checkAndAddColumn('talleres_servicios_catalogo', 'updated_by', "VARCHAR(255) DEFAULT NULL")
          await checkAndAddColumn('talleres_servicios_catalogo', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
          await checkAndAddColumn('talleres_servicios_catalogo', 'updated_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
          await runOptionalIndexQuery(`ALTER TABLE talleres_servicios_catalogo ADD INDEX idx_talleres_servicios_activo_orden (activo, orden)`)
        }
      } catch (e) {}

      await checkAndAddColumn('users', 'role', "VARCHAR(20) NOT NULL DEFAULT 'plantel'")
      await checkAndAddColumn('users', 'planteles', "TEXT", "UPDATE users SET planteles = plantel WHERE plantel IS NOT NULL AND (planteles IS NULL OR planteles = '')")
      await checkAndAddColumn('users', 'email', "VARCHAR(255) DEFAULT NULL")
      await checkAndAddColumn('users', 'avatar', "VARCHAR(255) DEFAULT NULL")

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'conceptos'`)

        if (tables.length > 0) {
          await checkAndAddColumn('conceptos', 'plantel', "VARCHAR(255) NOT NULL DEFAULT 'global'")
        }
      } catch (e) {}

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'base'`)

        if (tables.length > 0) {
          await checkAndAddColumn('base', 'genero', "VARCHAR(255) DEFAULT '1'")
          await checkAndAddColumn('base', 'curp', "VARCHAR(18) DEFAULT NULL")

          const familiaIdCols = await rawQuery<any[]>(`SHOW COLUMNS FROM base LIKE 'familiaId'`)
          if (familiaIdCols.length > 0) {
            // Familia / hermanos se calcula por padre y madre en Control Escolar.
            // No migrar familiaId financiero ni recrear vínculos locales.
            await runSafeQuery(`ALTER TABLE base DROP COLUMN familiaId`)
          }

          await runOptionalIndexQuery(`ALTER TABLE base ADD INDEX idx_base_matricula_estatus (matricula(64), estatus(20))`)
          await runOptionalIndexQuery(`ALTER TABLE base ADD INDEX idx_base_plantel_estatus (plantel(20), estatus(20))`)
        }
      } catch (e) {}

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'referenciasdepago'`)

        if (tables.length > 0) {
          const fechaColumns = await rawQuery<any[]>(`SHOW COLUMNS FROM referenciasdepago LIKE 'fecha'`)
          if (fechaColumns.length === 0) {
            await rawQuery(`ALTER TABLE referenciasdepago ADD COLUMN fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`)
          } else {
            const fechaType = String(fechaColumns[0]?.Type || '').toLowerCase()
            if (fechaType === 'date') {
              await runSafeQuery(`UPDATE referenciasdepago SET fecha = CURRENT_DATE WHERE fecha IS NULL`)
              await rawQuery(`ALTER TABLE referenciasdepago MODIFY COLUMN fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`)
            }
          }

          await checkAndAddColumn('referenciasdepago', 'fecha_original', "DATETIME DEFAULT NULL")
          await checkAndAddColumn('referenciasdepago', 'fecha_modificada_at', "DATETIME DEFAULT NULL")
          await checkAndAddColumn('referenciasdepago', 'fecha_modificada_por', "VARCHAR(255) DEFAULT NULL")
          await runSafeQuery(`UPDATE referenciasdepago SET fecha_original = fecha WHERE fecha_original IS NULL AND fecha IS NOT NULL`)
          await checkAndAddColumn('referenciasdepago', 'depurado', "TINYINT(1) NOT NULL DEFAULT 0")
          await checkAndAddColumn('referenciasdepago', 'depurado_por', "VARCHAR(255) DEFAULT NULL")
          await checkAndAddColumn('referenciasdepago', 'depurado_fecha', "DATETIME DEFAULT NULL")
          await checkAndAddColumn('referenciasdepago', 'pago_otro_plantel', "TINYINT(1) NOT NULL DEFAULT 0")
          await checkAndAddColumn('referenciasdepago', 'plantel_pago', "VARCHAR(20) DEFAULT NULL")
          await runSafeQuery(`
            UPDATE referenciasdepago
            SET pago_otro_plantel = 1
            WHERE COALESCE(pago_otro_plantel, 0) = 0
              AND COALESCE(depurado, 0) = 1
              AND LOWER(TRIM(COALESCE(formaDePago, ''))) NOT IN ('depuracion', 'depuración')
          `)
          await runOptionalIndexQuery(`ALTER TABLE referenciasdepago ADD INDEX idx_ref_ciclo_matricula_documento_mes_estatus (ciclo(20), matricula(64), documento, mes(20), estatus(30))`)
        }
      } catch (e) {}

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'documentos'`)

        if (tables.length > 0) {
          await checkAndAddColumn('documentos', 'montoFinal', "DECIMAL(65,2) DEFAULT NULL")
          await checkAndAddColumn('documentos', 'beca', "VARCHAR(255) DEFAULT '0'")
          await checkAndAddColumn('documentos', 'becaNombre', "VARCHAR(255) DEFAULT NULL")
          await checkAndAddColumn('documentos', 'becaTipos', "TEXT DEFAULT NULL")
          await checkAndAddColumn('documentos', 'becaMotivo', "TEXT DEFAULT NULL")
          await checkAndAddColumn('documentos', 'becaMonto', "DECIMAL(65,2) NOT NULL DEFAULT 0")
          await checkAndAddColumn('documentos', 'becaPorcentaje', "DECIMAL(8,2) NOT NULL DEFAULT 0")
          await checkAndAddColumn('documentos', 'becaCartaGenerada', "TINYINT(1) NOT NULL DEFAULT 0")
          await checkAndAddColumn('documentos', 'becaCartaFecha', "DATETIME DEFAULT NULL")
          await runOptionalIndexQuery(`ALTER TABLE documentos ADD INDEX idx_documentos_ciclo_estatus_matricula (ciclo(20), estatus(20), matricula(64))`)
        }
      } catch (e) {}

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'documento_concepto_periodos'`)

        if (tables.length > 0) {
          await checkAndAddColumn('documento_concepto_periodos', 'montoFinal', "DECIMAL(65,2) DEFAULT NULL")
          await checkAndAddColumn('documento_concepto_periodos', 'payment_policy', "VARCHAR(40) NOT NULL DEFAULT 'mantener_pagos_existentes'")
          await checkAndAddColumn('documento_concepto_periodos', 'diferencia_monto', "DECIMAL(65,2) NOT NULL DEFAULT 0")
          await checkAndAddColumn('documento_concepto_periodos', 'diferencial_documento', "INT DEFAULT NULL")
          await runOptionalIndexQuery(`ALTER TABLE documento_concepto_periodos ADD INDEX idx_documento_periodo_diferencial (diferencial_documento)`)
        }
      } catch (e) {}


      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS cobranza_eventos (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          matricula VARCHAR(255) NOT NULL,
          ciclo VARCHAR(50) NOT NULL,
          mes INT NOT NULL,
          accion VARCHAR(50) NOT NULL,
          fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          usuario VARCHAR(255) NOT NULL,
          metadata JSON NULL,
          UNIQUE KEY uniq_cobranza_accion_periodo (matricula, ciclo, mes, accion),
          INDEX idx_cobranza_matricula_periodo (matricula, ciclo, mes)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS cobranza_observaciones (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          matricula VARCHAR(255) NOT NULL,
          ciclo VARCHAR(50) NOT NULL,
          texto TEXT NOT NULL,
          usuario VARCHAR(255) NOT NULL,
          fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_cobranza_obs_lookup (matricula, ciclo, fecha)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS cobranza_excepciones (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          matricula VARCHAR(255) NOT NULL,
          ciclo VARCHAR(50) NOT NULL,
          mes INT NOT NULL,
          fecha_limite_especial DATE NOT NULL,
          motivo TEXT NULL,
          activa TINYINT(1) NOT NULL DEFAULT 1,
          created_by VARCHAR(255) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_cobranza_excepcion_periodo (matricula, ciclo, mes),
          INDEX idx_cobranza_excepciones_activa (ciclo, mes, activa)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS cobranza_email_templates (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(100) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          html_template LONGTEXT NOT NULL,
          include_desglose TINYINT(1) NOT NULL DEFAULT 1,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          updated_by VARCHAR(255) NULL,
          UNIQUE KEY uniq_cobranza_email_template_code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await runSafeQuery(`
        CREATE TABLE IF NOT EXISTS cobranza_whatsapp_clients (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          client_id VARCHAR(255) NOT NULL,
          integration_id VARCHAR(255) NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          display_name VARCHAR(255) NULL,
          user_email VARCHAR(255) NULL,
          endpoint_status VARCHAR(500) NULL,
          endpoint_qr_status VARCHAR(500) NULL,
          endpoint_qr_stream VARCHAR(500) NULL,
          endpoint_send_message VARCHAR(500) NULL,
          metadata JSON NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_cobranza_wa_client_id (client_id),
          INDEX idx_cobranza_wa_user (user_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

      await checkAndAddColumn('cobranza_email_templates', 'include_desglose', "TINYINT(1) NOT NULL DEFAULT 1")

      await runSafeQuery(`
        INSERT INTO cobranza_email_templates (code, subject, html_template, include_desglose, updated_by)
        VALUES (
          'deudores_recordatorio',
          'Recordatorio de pago - {{nombre_alumno}}',
          '<div style="font-family: Inter, Arial, sans-serif; color: #1f2937; max-width: 680px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; background: #ffffff;"><div style="background:#0f766e;color:#fff;padding:18px 24px;"><h2 style="margin:0;font-size:18px;">Recordatorio de pago</h2><p style="margin:4px 0 0;font-size:13px;opacity:.9;">Estado de cuenta escolar</p></div><div style="padding:24px;"><p style="margin-top:0;">Estimado(a) <strong>{{tutor}}</strong>,</p><p>Le informamos que el estado de cuenta del alumno <strong>{{nombre_alumno}}</strong> presenta un saldo pendiente por <strong>{{saldo_total_formateado}}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;"><tbody><tr><td style="padding:8px 0;color:#64748b;">Matricula</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{matricula}}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Ciclo</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{ciclo}}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Periodo de cobranza</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{periodo_cobranza}}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Fecha limite</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{fecha_limite_pago}}</td></tr></tbody></table>{{desglose_table}}<p>Le solicitamos regularizar el pago o comunicarse con Administracion si ya cuenta con un comprobante en proceso de conciliacion.</p><p style="margin-bottom:0;">Atentamente,<br><strong>Administracion y Cobranza</strong></p></div></div>',
          1,
          'system'
        )
        ON DUPLICATE KEY UPDATE subject = IF(updated_by = 'system', VALUES(subject), subject), html_template = IF(updated_by = 'system', VALUES(html_template), html_template), include_desglose = IF(updated_by = 'system', VALUES(include_desglose), include_desglose);
      `)
      try {
        const superAdminEmail = 'desarrollo.tecnologico@casitaiedis.edu.mx'
        const existingAdmin = await rawQuery<any[]>(`SELECT id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1`, [superAdminEmail])
        const allPlanteles = 'PREEM,PREET,CT,CM,DM,CO,DC,GM,PM,PT,SM,ST,IS,ISM'

        if (existingAdmin.length === 0) {
          const hash = bcrypt.hashSync('SUPER_ADMIN_AUTO_SEED', 10)

          await rawQuery(
            `INSERT INTO users (username, password, email, planteles, role, plantel) VALUES (?, ?, ?, ?, 'superadmin', ?)`,
            ['Super Administrador', hash, superAdminEmail, allPlanteles, 'PREEM']
          )
        } else {
          await rawQuery(
            `UPDATE users SET role = 'superadmin', planteles = ?, plantel = IFNULL(NULLIF(plantel, ''), ?) WHERE id = ?`,
            [allPlanteles, 'PREEM', existingAdmin[0].id]
          )
        }
      } catch (err: any) {
        console.error('[Schema Update Error] Falla en sembrado admin:', err.message)
      }

      ensuredSchemaKeys.add(schemaKey)
    })().catch(err => {
      schemaPromises.delete(schemaKey)
      throw err
    })

    schemaPromises.set(schemaKey, schemaPromise)
  }

  await schemaPromises.get(schemaKey)
}

export const runRawSqlStatement = async <T>(sql: string, params?: SqlParams): Promise<T> => {
  return await rawQuery<T>(sql, params)
}

const schemaErrorCode = (error: any) => String(
  error?.code ||
  error?.data?.diagnostic?.code ||
  error?.diagnostic?.code ||
  error?.bridgePayload?.error?.code ||
  error?.cause?.code ||
  ''
).trim().toUpperCase()

const isSchemaDriftError = (error: any) => {
  const code = schemaErrorCode(error)
  return code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE'
}

const repairSchemaForCurrentScope = async (error: any) => {
  const schemaKey = getSchemaStateKey()
  const existing = schemaRepairPromises.get(schemaKey)
  if (existing) return await existing

  const repair = (async () => {
    const code = schemaErrorCode(error)
    console.warn(`[AuroraDiag] ${JSON.stringify({
      scope: 'db.schema-repair',
      phase: 'start',
      schemaKey,
      agentId: getTransport() === 'bridge' ? getBridgeAgentId() : '',
      code
    })}`)

    ensuredSchemaKeys.delete(schemaKey)
    schemaPromises.delete(schemaKey)
    await ensureSchema({ allowBridge: getTransport() === 'bridge' })

    console.warn(`[AuroraDiag] ${JSON.stringify({
      scope: 'db.schema-repair',
      phase: 'finish',
      schemaKey,
      agentId: getTransport() === 'bridge' ? getBridgeAgentId() : '',
      code,
      ok: true
    })}`)
  })().finally(() => {
    schemaRepairPromises.delete(schemaKey)
  })

  schemaRepairPromises.set(schemaKey, repair)
  return await repair
}

export const query = async <T>(sql: string, params?: SqlParams, isRetry = false): Promise<T> => {
  // Direct databases keep the normal startup check. Bridge databases are
  // repaired only after an explicit schema error, coalesced per agent, so a
  // healthy login never launches the full migration sequence.
  if (getTransport() !== 'bridge') await ensureSchema()

  try {
    return await rawQuery<T>(sql, params)
  } catch (err: any) {
    if (!isRetry && isSchemaDriftError(err)) {
      await repairSchemaForCurrentScope(err)
      return await rawQuery<T>(sql, params)
    }

    throw err
  }
}

export const executeStatementTransaction = async <T = any>(statements: SqlStatement[], isRetry = false): Promise<T[]> => {
  if (getTransport() !== 'bridge') await ensureSchema()

  if (!statements.length) return []

  if (getTransport() === 'bridge') {
    const agentId = getBridgeAgentId()

    try {
      const payload = await bridgeFetch<BridgeQueryResponse>(`/agents/${encodeURIComponent(agentId)}/transaction`, {
        statements
      })
      const results = findBridgeTransactionResults(payload)

      if (!results) {
        const error: any = new Error('DB bridge transaction response did not include a results array.')
        error.code = 'DB_BRIDGE_BAD_TRANSACTION_RESPONSE'
        error.httpStatus = 502
        error.bridgePayload = payload
        throw attachBridgeDiagnostic(error, `/agents/${encodeURIComponent(agentId)}/transaction`)
      }

      return results.map(result => normalizeBridgeQueryResult<T>(result))
    } catch (error: any) {
      if (!isRetry && isSchemaDriftError(error)) {
        await repairSchemaForCurrentScope(error)
        return await executeStatementTransaction<T>(statements, true)
      }
      throw error
    }
  }

  const db = getDb()
  const connection = await db.getConnection()

  await connection.beginTransaction()

  try {
    const results: T[] = []

    for (const statement of statements) {
      const [rows] = await connection.query(statement.sql, (statement.params || []) as never)
      results.push(rows as T)
    }

    await connection.commit()
    return results
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const executeTransaction = async (callback: (connection: PoolConnection) => Promise<any>) => {
  await ensureSchema()

  if (getTransport() === 'bridge') {
    throw new Error('executeTransaction(callback) no esta disponible con DB_TRANSPORT=bridge. Usa executeStatementTransaction().')
  }

  const db = getDb()
  const connection = await db.getConnection()

  await connection.beginTransaction()

  try {
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
