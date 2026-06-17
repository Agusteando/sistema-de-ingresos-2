import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo un superadministrador puede forzar una actualización.' })
  }

  const requestId = String(event.context?.auroraRequestId || '')
  if (isLocalSystemRuntime()) {
    return await requestLocalSystemManager('/update', { method: 'POST' })
  }

  if (getDbTransport() !== 'bridge') {
    throw createError({ statusCode: 409, message: 'La actualización remota requiere el bridge del plantel.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const plantel = normalizePlantel(body?.plantel || user?.active_plantel)
  if (!plantel || plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel antes de actualizar Sistema Rápido.' })
  }

  const bridgeResponse = await runWithBridgeAgentId(plantel, () => runRawSqlStatement<unknown>(
    LOCAL_SYSTEM_BRIDGE_COMMAND,
    ['update', user.email || '', plantel]
  ))
  const result = unwrapLocalSystemBridgeResult(bridgeResponse)
  if (!result?.ok) {
    throw createError({
      statusCode: 503,
      message: result?.message || 'El agente no aceptó la actualización.',
      data: { code: result?.code || 'LOCAL_SYSTEM_UPDATE_REJECTED', requestId: result?.requestId || requestId, plantel }
    })
  }

  return {
    ok: true,
    accepted: true,
    requestId: result.requestId || requestId,
    plantel,
    operation: result.operation || null
  }
})
