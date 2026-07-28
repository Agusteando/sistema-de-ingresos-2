import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { assertLocalSystemPlantelEligibility, bridgeAgentMatchesPlantel } from '../../utils/local-system-eligibility'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

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

  // Preflight the exact bridge agent before sending the update command. A
  // missing or mismatched agent must never start installation or build work.
  const statusBridgeResponse = await runWithBridgeAgentId(activePlantel, () => runRawSqlStatement<unknown>(
    LOCAL_SYSTEM_BRIDGE_COMMAND,
    ['status', user.email, activePlantel]
  ))
  const statusResult = unwrapLocalSystemBridgeResult(statusBridgeResponse)
  if (!bridgeAgentMatchesPlantel(statusResult, activePlantel)) {
    throw createError({
      statusCode: 409,
      message: 'Este equipo no tiene un agente válido para el plantel activo.',
      data: {
        code: statusResult?.code || 'LOCAL_SYSTEM_AGENT_MISMATCH',
        requestId: statusResult?.requestId || requestId,
        plantel: activePlantel
      }
    })
  }

  const bridgeResponse = await runWithBridgeAgentId(activePlantel, () => runRawSqlStatement<unknown>(
    LOCAL_SYSTEM_BRIDGE_COMMAND,
    ['update', user.email, activePlantel]
  ))
  const result = unwrapLocalSystemBridgeResult(bridgeResponse)
  if (!bridgeAgentMatchesPlantel(result, activePlantel) || !result?.ok) {
    throw createError({
      statusCode: 503,
      message: result?.message || 'El agente no aceptó la actualización.',
      data: {
        code: result?.code || 'LOCAL_SYSTEM_UPDATE_REJECTED',
        requestId: result?.requestId || requestId,
        plantel: activePlantel
      }
    })
  }

  return {
    ok: true,
    accepted: true,
    requestId: result.requestId || requestId,
    plantel: activePlantel,
    operation: result.operation || null
  }
})
