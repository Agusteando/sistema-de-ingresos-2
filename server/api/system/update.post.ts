import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { runCompatibleLocalSystemBridgeCommand } from '../../utils/local-system-handoff'
import { assertLocalSystemPlantelEligibility, bridgeAgentMatchesPlantel } from '../../utils/local-system-eligibility'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

const withUpdateIntent = (value: string) => {
  const url = new URL(value)
  url.searchParams.set('intent', 'update')
  return url.toString()
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const requestId = String(event.context?.auroraRequestId || '')
  if (isLocalSystemRuntime()) {
    assertLocalSystemPlantelEligibility(event)
    return await requestLocalSystemManager('/update', { method: 'POST' })
  }

  if (getDbTransport() !== 'bridge') {
    throw createError({ statusCode: 409, message: 'La actualización requiere el agente del plantel.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const activePlantel = normalizePlantel(user.active_plantel)
  const requestedPlantel = normalizePlantel(body?.plantel || activePlantel)
  if (!activePlantel || activePlantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel antes de actualizar.' })
  }
  if (requestedPlantel !== activePlantel) {
    throw createError({ statusCode: 409, message: 'La actualización solo puede ejecutarse para el plantel activo.' })
  }

  const execute = (sql: string, params: ['status' | 'launch', string, string]) => (
    runWithBridgeAgentId(activePlantel, () => runRawSqlStatement<unknown>(sql, params))
  )

  // First prove that the routed agent reports the exact active plantel. No
  // installation, build, or launch is attempted when this preflight fails.
  const statusExecution = await runCompatibleLocalSystemBridgeCommand(
    execute,
    'status',
    user.email,
    activePlantel,
  )
  const statusResult = statusExecution.result
  if (!bridgeAgentMatchesPlantel(statusResult, activePlantel)) {
    throw createError({
      statusCode: 409,
      message: 'Este equipo no tiene un agente válido para el plantel activo.',
      data: {
        code: statusResult?.code || 'LOCAL_SYSTEM_AGENT_MISMATCH',
        requestId: statusResult?.requestId || requestId,
        plantel: activePlantel,
        protocol: statusExecution.protocol,
      }
    })
  }

  // The deployed agent intentionally exposes only status and launch. Aurora
  // therefore enters the authenticated local runtime and lets that runtime
  // call its manager's /update endpoint; the bridge agent is never updated.
  const launchExecution = await runCompatibleLocalSystemBridgeCommand(
    execute,
    'launch',
    user.email,
    activePlantel,
  )
  const launchResult = launchExecution.result
  if (!bridgeAgentMatchesPlantel(launchResult, activePlantel) || !launchResult?.ok || !launchResult.launchUrl) {
    throw createError({
      statusCode: 503,
      message: launchResult?.message || 'La instalación de este equipo no está disponible para actualizarse.',
      data: {
        code: launchResult?.code || 'LOCAL_SYSTEM_UPDATE_HANDOFF_REJECTED',
        requestId: launchResult?.requestId || requestId,
        plantel: activePlantel,
        protocol: launchExecution.protocol,
      }
    })
  }

  return {
    ok: true,
    accepted: true,
    requiresLocalHandoff: true,
    launchUrl: withUpdateIntent(launchResult.launchUrl),
    expiresAt: launchResult.expiresAt || null,
    requestId: launchResult.requestId || requestId,
    plantel: activePlantel,
    protocol: launchExecution.protocol,
  }
})
