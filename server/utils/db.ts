import { AsyncLocalStorage } from 'node:async_hooks'
import mysql, { type PoolConnection } from 'mysql2/promise'
import bcrypt from 'bcryptjs'

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

type BridgeQueryResponse = {
  ok: true
  rows?: any
  result?: any
  fields?: Array<{
    name: string
    table?: string
    orgTable?: string
    type?: number
  }>
  affectedRows?: number
  insertId?: number
  changedRows?: number
  warningStatus?: number
}

type BridgeErrorResponse = {
  ok: false
  error: {
    message: string
    code?: string
    errno?: number
    sqlState?: string
  }
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

let pool: mysql.Pool
const ensuredSchemaKeys = new Set<string>()
const schemaPromises = new Map<string, Promise<void>>()
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
  const configuredAgentId = getConfiguredBridgeAgentId()

  if (configuredAgentId) {
    debugBridge('agent resolved from DB_BRIDGE_AGENT_ID', { agentId: configuredAgentId })
    return configuredAgentId
  }

  const requestContextAgentId = getRequestContextBridgeAgentId()

  if (requestContextAgentId) {
    debugBridge('agent resolved from request context', { agentId: requestContextAgentId })
    return requestContextAgentId
  }

  const asyncContextAgentId = String(bridgeAgentContext.getStore()?.agentId || '').trim()

  if (asyncContextAgentId) {
    debugBridge('agent resolved from async context', { agentId: asyncContextAgentId })
    return asyncContextAgentId
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

export const BRIDGE_AGENT_UNAVAILABLE_MESSAGE = 'La base del plantel no está disponible en este momento. Solicita al Administrador verificar la conectividad del equipo del plantel e inténtalo nuevamente.'

const getBridgeErrorText = (error: any) => [
  error?.bridgePayload?.error?.message,
  error?.bridgePayload?.message,
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
  const err: any = new Error(payload.error?.message || `DB bridge error${fallbackStatus ? ` (${fallbackStatus})` : ''}`)
  err.code = payload.error?.code || (fallbackStatus ? `DB_BRIDGE_HTTP_${fallbackStatus}` : undefined)
  err.errno = payload.error?.errno
  err.sqlState = payload.error?.sqlState
  err.httpStatus = fallbackStatus
  err.bridgePayload = payload
  return err
}

const makeBridgeHttpError = (status: number, payload: any) => {
  const bridgeMessage = payload?.error?.message || payload?.message || ''
  const suffix = bridgeMessage ? `: ${bridgeMessage}` : ' sin detalle del servicio'
  const err: any = new Error(`DB bridge respondió con HTTP ${status}${suffix}. La operación no fue confirmada; revisa que el bridge y el agente de base estén disponibles.`)
  err.code = `DB_BRIDGE_HTTP_${status}`
  err.httpStatus = status
  err.statusCode = status >= 400 && status < 600 ? status : 500
  err.bridgePayload = payload
  return err
}

const normalizeBridgeQueryResult = <T>(payload: BridgeQueryResponse): T => {
  const rows = payload.rows ?? payload.result
  const isWriteResult =
    typeof payload.affectedRows === 'number' ||
    typeof payload.insertId === 'number' ||
    typeof payload.changedRows === 'number' ||
    typeof payload.warningStatus === 'number'

  if (isWriteResult) {
    return {
      affectedRows: payload.affectedRows || 0,
      insertId: payload.insertId || 0,
      changedRows: payload.changedRows || 0,
      warningStatus: payload.warningStatus || 0
    } as T
  }

  return rows as T
}

const bridgeFetch = async <T>(path: string, body?: unknown, options: BridgeFetchOptions = {}): Promise<T> => {
  const config = getRuntimeDbConfig()
  const url = `${getBridgeBaseUrl()}${path}`
  const controller = new AbortController()
  const timeoutMs = Number(options.timeoutMs || getBridgeTimeoutMs())
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (config.dbBridgeToken) {
      headers.Authorization = `Bearer ${config.dbBridgeToken}`
    }

    debugBridge('fetch bridge request', { url })

    let response

    try {
      response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers,
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
      throw err
    }

    const payload = await response.json().catch(() => null)

    debugBridge('fetch bridge response', {
      url,
      status: response.status,
      ok: response.ok,
      payloadOk: payload?.ok
    })

    if (!response.ok || !payload) {
      throw makeBridgeHttpError(response.status, payload)
    }

    if (payload.ok === false) {
      throw makeBridgeError(payload, response.status)
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

export const ensureSchema = async () => {
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
        CREATE TABLE IF NOT EXISTS control_escolar_audit_events (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          event_type VARCHAR(40) NOT NULL,
          plantel VARCHAR(20) NOT NULL,
          ciclo VARCHAR(20) DEFAULT '',
          matricula VARCHAR(64) DEFAULT NULL,
          actor_email VARCHAR(255) DEFAULT NULL,
          actor_name VARCHAR(255) DEFAULT NULL,
          actor_role VARCHAR(255) DEFAULT NULL,
          summary VARCHAR(255) NOT NULL,
          progress_percent DECIMAL(5,2) DEFAULT NULL,
          total_students INT DEFAULT NULL,
          completed_students INT DEFAULT NULL,
          pending_students INT DEFAULT NULL,
          source_base VARCHAR(180) DEFAULT NULL,
          source_flow VARCHAR(180) DEFAULT NULL,
          payload JSON NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_control_audit_scope (plantel, ciclo, created_at),
          INDEX idx_control_audit_type (event_type, created_at),
          INDEX idx_control_audit_matricula (matricula, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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
          INDEX idx_documento_periodo (documento, start_mes, end_mes, estatus)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `)

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
            await runSafeQuery(`
              INSERT IGNORE INTO student_family_links (family_key, matricula)
              SELECT CONCAT('legacy:', familiaId), matricula
              FROM base
              WHERE familiaId IS NOT NULL AND CAST(familiaId AS CHAR) <> ''
            `)
            await runSafeQuery(`ALTER TABLE base DROP COLUMN familiaId`)
          }

          await runOptionalIndexQuery(`ALTER TABLE base ADD INDEX idx_base_matricula_estatus (matricula(64), estatus(20))`)
          await runOptionalIndexQuery(`ALTER TABLE base ADD INDEX idx_base_plantel_estatus (plantel(20), estatus(20))`)
        }
      } catch (e) {}

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'referenciasdepago'`)

        if (tables.length > 0) {
          await checkAndAddColumn('referenciasdepago', 'depurado', "TINYINT(1) NOT NULL DEFAULT 0")
          await checkAndAddColumn('referenciasdepago', 'depurado_por', "VARCHAR(255) DEFAULT NULL")
          await checkAndAddColumn('referenciasdepago', 'depurado_fecha', "DATETIME DEFAULT NULL")
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
        const existingAdmin = await rawQuery<any[]>(`SELECT id FROM users WHERE email = ?`, [superAdminEmail])

        if (existingAdmin.length === 0) {
          const hash = bcrypt.hashSync('SUPER_ADMIN_AUTO_SEED', 10)
          const allPlanteles = 'PREEM,PREET,CT,CM,DM,CO,DC,PM,PT,SM,ST,IS,ISM'

          await rawQuery(
            `INSERT INTO users (username, password, email, planteles, role, plantel) VALUES (?, ?, ?, ?, 'global', ?)`,
            ['Super Administrador', hash, superAdminEmail, allPlanteles, 'PREEM']
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

export const query = async <T>(sql: string, params?: SqlParams, isRetry = false): Promise<T> => {
  await ensureSchema()

  try {
    return await rawQuery<T>(sql, params)
  } catch (err: any) {
    if (!isRetry && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE')) {
      console.warn('[DB Auto-Healing] Detectado esquema incompleto o desincronizado. Forzando re-evaluacion...')
      const schemaKey = getSchemaStateKey()
      ensuredSchemaKeys.delete(schemaKey)
      schemaPromises.delete(schemaKey)
      await ensureSchema()
      return await rawQuery<T>(sql, params)
    }

    throw err
  }
}

export const executeStatementTransaction = async <T = any>(statements: SqlStatement[]): Promise<T[]> => {
  await ensureSchema()

  if (!statements.length) return []

  if (getTransport() === 'bridge') {
    const agentId = getBridgeAgentId()

    const payload = await bridgeFetch<{ ok: true; results: BridgeQueryResponse[] }>(`/agents/${encodeURIComponent(agentId)}/transaction`, {
      statements
    })

    return payload.results.map(result => normalizeBridgeQueryResult<T>(result))
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
