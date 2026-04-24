import { getBridgeAgentId, getDbTransport } from '../../utils/db'

export default defineEventHandler((event) => {
  const cookies = {
    auth_email: getCookie(event, 'auth_email') || null,
    auth_role: getCookie(event, 'auth_role') || null,
    auth_planteles: getCookie(event, 'auth_planteles') || null,
    auth_active_plantel: getCookie(event, 'auth_active_plantel') || null,
    db_bridge_agent_id: getCookie(event, 'db_bridge_agent_id') || null
  }

  let bridgeAgentId: string | null = null
  let bridgeAgentError: string | null = null

  try {
    bridgeAgentId = getBridgeAgentId()
  } catch (error: any) {
    bridgeAgentError = error?.message || String(error)
  }

  return {
    ok: !bridgeAgentError,
    transport: getDbTransport(),
    bridgeAgentId,
    bridgeAgentError,
    cookies,
    headers: {
      xDbAgentId: getHeader(event, 'x-db-agent-id') || null,
      cookiePresent: Boolean(getHeader(event, 'cookie'))
    }
  }
})