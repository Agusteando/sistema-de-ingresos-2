import { AsyncLocalStorage } from 'node:async_hooks'
import { getCookie, getHeader } from 'h3'
import { useRequestEvent, useRuntimeConfig } from '#imports'
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

export type SqlStatement = {
  sql: string
  params?: SqlParams
}

let pool: mysql.Pool
const ensuredSchemaKeys = new Set<string>()
const schemaPromises = new Map<string, Promise<void>>()
const bridgeAgentContext = new AsyncLocalStorage<BridgeAgentContext>()

export const runWithBridgeAgentId = async <T>(
  agentId: string | undefined | null,
  callback: () => Promise<T>
): Promise<T> => {
  return await bridgeAgentContext.run({ agentId: String(agentId || '').trim() }, callback)
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

const getBridgeAgentIdCookieName = () => {
  const config = getRuntimeDbConfig()
  return String(config.dbBridgeAgentIdCookie || 'db_bridge_agent_id').trim() || 'db_bridge_agent_id'
}

const getRequestEventSafe = () => {
  try {
    return useRequestEvent()
  } catch (error: any) {
    debugBridge('useRequestEvent unavailable', { message: error?.message || String(error) })
    return null
  }
}

export const getBridgeAgentId = () => {
  const configuredAgentId = getConfiguredBridgeAgentId()

  if (configuredAgentId) {
    debugBridge('agent resolved from DB_BRIDGE_AGENT_ID', { agentId: configuredAgentId })
    return configuredAgentId
  }

  const asyncContextAgentId = String(bridgeAgentContext.getStore()?.agentId || '').trim()

  if (asyncContextAgentId) {
    debugBridge('agent resolved from async context', { agentId: asyncContextAgentId })
    return asyncContextAgentId
  }

  const event = getRequestEventSafe()

  if (event) {
    const eventContextAgentId = String((event.context as any)?.dbBridgeAgentId || '').trim()

    if (eventContextAgentId) {
      debugBridge('agent resolved from event.context.dbBridgeAgentId', { agentId: eventContextAgentId })
      return eventContextAgentId
    }

    const headerAgentId = String(getHeader(event, 'x-db-agent-id') || '').trim()

    if (headerAgentId) {
      debugBridge('agent resolved from x-db-agent-id header', { agentId: headerAgentId })
      return headerAgentId
    }

    const bridgeCookieName = getBridgeAgentIdCookieName()
    const bridgeCookieAgentId = String(getCookie(event, bridgeCookieName) || '').trim()

    if (bridgeCookieAgentId) {
      debugBridge('agent resolved from bridge cookie', {
        cookieName: bridgeCookieName,
        agentId: bridgeCookieAgentId
      })
      return bridgeCookieAgentId
    }

    const activePlantel = String(getCookie(event, 'auth_active_plantel') || '').trim()

    if (activePlantel) {
      debugBridge('agent resolved from auth_active_plantel cookie', { agentId: activePlantel })
      return activePlantel
    }

    debugBridge('event found but no agent source present', {
      hasCookieHeader: Boolean(getHeader(event, 'cookie')),
      bridgeCookieName,
      authActivePlantel: getCookie(event, 'auth_active_plantel') || null,
      bridgeCookie: getCookie(event, bridgeCookieName) || null,
      xDbAgentId: getHeader(event, 'x-db-agent-id') || null
    })
  } else {
    debugBridge('no active request event found')
  }

  throw new Error('No DB bridge agent selected. Provide DB_BRIDGE_AGENT_ID, async request bridge context, event.context.dbBridgeAgentId, x-db-agent-id header, db_bridge_agent_id cookie, or auth_active_plantel cookie.')
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

const makeBridgeError = (payload: BridgeErrorResponse, fallbackStatus?: number) => {
  const err: any = new Error(payload.error?.message || `DB bridge error${fallbackStatus ? ` (${fallbackStatus})` : ''}`)
  err.code = payload.error?.code
  err.errno = payload.error?.errno
  err.sqlState = payload.error?.sqlState
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

const bridgeFetch = async <T>(path: string, body?: unknown): Promise<T> => {
  const config = getRuntimeDbConfig()
  const url = `${getBridgeBaseUrl()}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getBridgeTimeoutMs())

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (config.dbBridgeToken) {
      headers.Authorization = `Bearer ${config.dbBridgeToken}`
    }

    debugBridge('fetch bridge request', { url })

    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })

    const payload = await response.json().catch(() => null)

    debugBridge('fetch bridge response', {
      url,
      status: response.status,
      ok: response.ok,
      payloadOk: payload?.ok
    })

    if (!response.ok || !payload) {
      throw new Error(`DB bridge respondio con HTTP ${response.status}.`)
    }

    if (payload.ok === false) {
      throw makeBridgeError(payload, response.status)
    }

    return payload as T
  } finally {
    clearTimeout(timeout)
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
    if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.error(`[Schema Update Error] ${sql.substring(0, 50)}... ->`, err.message)
    }
  }
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

      await checkAndAddColumn('users', 'role', "VARCHAR(20) NOT NULL DEFAULT 'plantel'")
      await checkAndAddColumn('users', 'planteles', "TEXT", "UPDATE users SET planteles = plantel WHERE plantel IS NOT NULL AND (planteles IS NULL OR planteles = '')")
      await checkAndAddColumn('users', 'email', "VARCHAR(255) DEFAULT NULL")
      await checkAndAddColumn('users', 'avatar', "VARCHAR(255) DEFAULT NULL")

      try {
        const tables = await rawQuery<any[]>(`SHOW TABLES LIKE 'base'`)

        if (tables.length > 0) {
          await checkAndAddColumn('base', 'interno', "TINYINT(1) NOT NULL DEFAULT 1")
          await checkAndAddColumn('base', 'familiaId', "INT DEFAULT NULL")
        }
      } catch (e) {}

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