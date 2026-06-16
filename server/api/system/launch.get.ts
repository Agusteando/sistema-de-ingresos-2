import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { isLocalSystemRuntime } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  if (isLocalSystemRuntime()) return sendRedirect(event, '/', 302)
  if (getDbTransport() !== 'bridge') {
    throw createError({ statusCode: 409, message: 'Sistema Rápido se descubre mediante el agente Bridge del plantel.' })
  }

  const user = event.context.user
  const requested = normalizePlantel(getQuery(event).plantel || user?.active_plantel)
  if (!user?.email || !requested || requested === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel antes de abrir Sistema Rápido.' })
  }
  if (!user.isSuperAdmin && !user.plantelesList.includes(requested)) {
    throw createError({ statusCode: 403, message: 'No tienes acceso a este plantel.' })
  }

  const bridgeResponse = await runWithBridgeAgentId(requested, () => runRawSqlStatement<unknown>(
    LOCAL_SYSTEM_BRIDGE_COMMAND,
    ['launch', user.email, requested]
  ))
  const result = unwrapLocalSystemBridgeResult(bridgeResponse)
  if (!result?.ok || !result.launchUrl) {
    throw createError({
      statusCode: 503,
      message: result?.message || 'Sistema Rápido todavía no está disponible en este plantel.'
    })
  }

  const accept = String(getHeader(event, 'accept') || '').toLowerCase()
  if (accept.includes('application/json') || getQuery(event).format === 'json') {
    return { ok: true, launchUrl: result.launchUrl, expiresAt: result.expiresAt || null }
  }

  return sendRedirect(event, result.launchUrl, 302)
})
