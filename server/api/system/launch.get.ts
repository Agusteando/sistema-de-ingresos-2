import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { isLocalSystemRuntime } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  if (isLocalSystemRuntime()) return sendRedirect(event, '/', 302)
  if (getDbTransport() !== 'bridge') {
    throw createError({ statusCode: 409, message: 'Aurora Local se descubre mediante el agente Bridge del plantel.' })
  }

  const user = event.context.user
  const requested = normalizePlantel(getQuery(event).plantel || user?.active_plantel)
  if (!user?.email || !requested || requested === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel antes de abrir Aurora Local.' })
  }
  if (!user.isSuperAdmin && !user.plantelesList.includes(requested)) {
    throw createError({ statusCode: 403, message: 'No tienes acceso a este plantel.' })
  }

  // Keep environment switching identical to the proven V1 flow: route the
  // request to the selected plantel agent, ask it only for a launch handoff,
  // and immediately redirect the browser to the one-time URL it returns.
  // Status checks, update discovery, builds and activation are separate flows.
  const bridgeResponse = await runWithBridgeAgentId(requested, () => runRawSqlStatement<unknown>(
    LOCAL_SYSTEM_BRIDGE_COMMAND,
    ['launch', user.email, requested]
  ))
  const result = unwrapLocalSystemBridgeResult(bridgeResponse)

  if (!result?.ok || !result.launchUrl) {
    throw createError({
      statusCode: 503,
      message: result?.message || 'Aurora Local no devolvió un acceso para este plantel.',
      data: {
        code: result?.code || 'LOCAL_SYSTEM_LAUNCH_UNAVAILABLE',
        requestId: result?.requestId || String(event.context?.auroraRequestId || ''),
        plantel: requested
      }
    })
  }

  // JSON is kept only for the cloud-login broker, which needs the one-time URL
  // as data before returning an unauthenticated Local browser to its runtime.
  // Normal environment switching does not use this branch: it navigates here
  // directly and receives the 302 below.
  if (getQuery(event).format === 'json') {
    return {
      ok: true,
      launchUrl: result.launchUrl,
      expiresAt: result.expiresAt || null,
      code: result.code || 'LOCAL_SYSTEM_READY',
      requestId: result.requestId || String(event.context?.auroraRequestId || '')
    }
  }

  return sendRedirect(event, result.launchUrl, 302)
})
