import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, localSystemDiagnosticSummary, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { isLocalSystemRuntime } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  if (isLocalSystemRuntime()) return sendRedirect(event, '/', 302)
  if (getDbTransport() !== 'bridge') {
    throw createError({ statusCode: 409, message: 'Sistema Rápido se descubre mediante el agente Bridge del plantel.' })
  }

  const user = event.context.user
  const requestId = String(event.context?.auroraRequestId || '')
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
  const diagnostics = localSystemDiagnosticSummary(result)
  if (!result?.ok || !result.launchUrl) {
    const code = result?.code || 'LOCAL_SYSTEM_LAUNCH_UNAVAILABLE'
    const effectiveRequestId = result?.requestId || requestId
    const message = result?.message || 'Sistema Rápido todavía no está disponible en este plantel.'
    console.error(`[SistemaRapidoDiag] ${JSON.stringify({
      event: 'central_launch_rejected',
      requestId: effectiveRequestId,
      auroraRequestId: requestId,
      plantel: requested,
      agentId: requested,
      code,
      message,
      diagnostics
    })}`)
    throw createError({
      statusCode: 503,
      message,
      data: {
        code,
        requestId: effectiveRequestId,
        plantel: requested,
        agentId: requested,
        stage: 'local_system_handoff',
        diagnostics
      }
    })
  }

  console.info(`[SistemaRapidoDiag] ${JSON.stringify({
    event: 'central_launch_ready',
    requestId: result.requestId || requestId,
    plantel: requested,
    agentId: requested,
    code: result.code || 'LOCAL_SYSTEM_READY',
    installedSha: result.installedSha || '',
    installedVersion: result.installedVersion || '',
    localUrl: result.localUrl || ''
  })}`)

  const accept = String(getHeader(event, 'accept') || '').toLowerCase()
  if (accept.includes('application/json') || getQuery(event).format === 'json') {
    return {
      ok: true,
      launchUrl: result.launchUrl,
      expiresAt: result.expiresAt || null,
      code: result.code || 'LOCAL_SYSTEM_READY',
      requestId: result.requestId || requestId
    }
  }

  return sendRedirect(event, result.launchUrl, 302)
})
