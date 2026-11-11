import { PLANTELES_LIST } from '../../utils/constants'
import { getDbTransport } from './db'

export function requireSqlConsoleAdmin(event: any) {
  if (!event.context.user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede consultar los agentes y exportar SQL.' })
  }
}

export function sqlExportPlantel(value: unknown): string {
  const code = String(value || '').trim().toUpperCase()
  if (!PLANTELES_LIST.includes(code)) {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel válido para el respaldo.' })
  }
  return code
}

export function sqlExportId(value: unknown): string {
  const id = String(value || '')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, message: 'Identificador de respaldo inválido.' })
  }
  return id
}

export function ensureSqlBridgeMode() {
  if (getDbTransport() !== 'bridge') {
    throw createError({ statusCode: 409, message: 'El respaldo por plantel requiere DB Bridge; no se usará una conexión alternativa.' })
  }
}

/** This helper ONLY talks to the configured authenticated relay, never to Aurora MySQL. */
export async function sqlConsoleRelay(event: any, route: string, method: 'GET' | 'POST' = 'GET', stream = false): Promise<any> {
  const config: any = useRuntimeConfig(event)
  const baseUrl = String(config.dbBridgeUrl || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]+/i.test(baseUrl)) {
    throw createError({ statusCode: 503, message: 'El servicio DB Bridge no está configurado.' })
  }
  const headers: Record<string, string> = { Accept: stream ? 'application/sql' : 'application/json' }
  if (method === 'POST') headers['Content-Type'] = 'application/json'
  if (config.dbBridgeToken) headers.Authorization = 'Bearer ' + config.dbBridgeToken
  if (event.context.auroraRequestId) headers['X-Aurora-Request-Id'] = String(event.context.auroraRequestId)
  const requestId = String(event.context.auroraRequestId || '')
  let response: Response
  try {
    response = await fetch(baseUrl + route, {
      method, headers, cache: 'no-store',
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(stream ? 30 * 60 * 1000 : 45000)
    })
  } catch (error: any) {
    console.error('[sql-console-bridge]', { requestId, route, code: error?.name || 'NETWORK' })
    throw createError({ statusCode: 503, message: 'El DB Bridge no respondió. No se generó un respaldo alternativo.', data: { requestId } })
  }
  if (!response.ok) {
    const body: any = await response.json().catch(() => null)
    const code = String(body?.error?.code || body?.code || 'BRIDGE_EXPORT_FAILED').slice(0, 100)
    console.error('[sql-console-bridge]', { requestId, route, upstreamStatus: response.status, code })
    throw createError({
      statusCode: response.status >= 400 && response.status < 500 ? response.status : 502,
      message: code === 'DB_BRIDGE_AGENT_OFFLINE'
        ? 'El agente de este plantel está desconectado.'
        : code === 'DB_BRIDGE_UNSUPPORTED_TYPE'
          ? 'El agente de este plantel aún no admite respaldo SQL. Actualiza el agente.'
          : 'El DB Bridge rechazó la solicitud: ' + code,
      data: { code, requestId }
    })
  }
  return stream ? response : await response.json()
}
