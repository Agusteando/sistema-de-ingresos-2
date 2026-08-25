import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { localSystemDiagnosticSummary, runCompatibleLocalSystemBridgeCommand } from '../../utils/local-system-handoff'
import { bridgeAgentMatchesPlantel } from '../../utils/local-system-eligibility'
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

  const execute = (sql: string, params: ['status' | 'launch', string, string]) => (
    runWithBridgeAgentId(requested, () => runRawSqlStatement<unknown>(sql, params))
  )

  // Prove the routed agent belongs to the requested plantel before asking it to
  // mint a one-time handoff. Legacy V1 launch responses do not always repeat the
  // plantel, so plantel identity must come from this explicit status preflight.
  const statusExecution = await runCompatibleLocalSystemBridgeCommand(
    execute,
    'status',
    user.email,
    requested,
  )
  const statusResult = statusExecution.result
  const statusDiagnostics = {
    ...localSystemDiagnosticSummary(statusResult),
    protocol: statusExecution.protocol
  }
  if (!bridgeAgentMatchesPlantel(statusResult, requested)) {
    const code = statusResult?.code || 'LOCAL_SYSTEM_AGENT_MISMATCH'
    const effectiveRequestId = statusResult?.requestId || requestId
    const message = statusResult?.message || 'Este equipo no tiene un agente válido para el plantel activo.'
    console.error(`[SistemaRapidoDiag] ${JSON.stringify({
      event: 'central_launch_preflight_rejected',
      requestId: effectiveRequestId,
      auroraRequestId: requestId,
      plantel: requested,
      agentId: requested,
      code,
      message,
      diagnostics: statusDiagnostics
    })}`)
    throw createError({
      statusCode: 409,
      message,
      data: {
        code,
        requestId: effectiveRequestId,
        plantel: requested,
        agentId: requested,
        stage: 'local_system_agent_preflight',
        diagnostics: statusDiagnostics
      }
    })
  }

  const launchExecution = await runCompatibleLocalSystemBridgeCommand(
    execute,
    'launch',
    user.email,
    requested,
  )
  const result = launchExecution.result
  const diagnostics = {
    ...localSystemDiagnosticSummary(result),
    protocol: launchExecution.protocol
  }

  // If a newer agent repeats its plantel in the launch response, validate it too.
  // Absence is allowed for the deployed V1 protocol because the status preflight
  // above already authenticated the exact routed agent.
  const launchReportedPlantel = String(
    result?.plantel || result?.diagnostics?.echoedPlantel || ''
  ).trim()
  const launchPlantelMismatch = Boolean(
    launchReportedPlantel
    && !bridgeAgentMatchesPlantel(result, requested)
  )

  if (launchPlantelMismatch || !result?.ok || !result.launchUrl) {
    const code = launchPlantelMismatch
      ? 'LOCAL_SYSTEM_AGENT_MISMATCH'
      : (result?.code || 'LOCAL_SYSTEM_LAUNCH_UNAVAILABLE')
    const effectiveRequestId = result?.requestId || requestId
    const message = launchPlantelMismatch
      ? 'El agente devolvió un acceso para otro plantel.'
      : (result?.message || 'Sistema Rápido todavía no está disponible en este plantel.')
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
      statusCode: launchPlantelMismatch ? 409 : 503,
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
    localUrl: result.localUrl || '',
    protocol: launchExecution.protocol
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
