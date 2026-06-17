const compactText = (value: unknown, limit = 240) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit)

const statusFromError = (error: any) => Number(
  error?.statusCode || error?.status || error?.httpStatus || error?.response?.status || 500
) || 500

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error: any, context: any = {}) => {
    const event = context?.event
    if (!event) return

    const url = getRequestURL(event)
    if (!url.pathname.startsWith('/api/')) return

    const status = statusFromError(error)
    if (status < 400) return

    const diagnostic = error?.data?.diagnostic || error?.diagnostic || {}
    const startedAt = Number(event.context?.auroraRequestStartedAt || Date.now())
    const user = event.context?.user || event.context?.trustedAuthUser || {}
    const payload = {
      requestId: event.context?.auroraRequestId || '',
      method: event.method,
      path: url.pathname,
      status,
      code: compactText(diagnostic.code || error?.code || error?.data?.code || `HTTP_${status}`, 80),
      source: compactText(diagnostic.source || event.context?.auroraStage || 'api', 80),
      stage: compactText(event.context?.auroraStage || '', 80),
      ms: Math.max(0, Date.now() - startedAt),
      email: compactText(user?.email, 120),
      role: compactText(user?.role, 120),
      impersonating: Boolean(getCookie(event, 'auth_impersonation_token')),
      activePlantel: compactText(user?.active_plantel || getCookie(event, 'auth_active_plantel'), 32),
      bridgeAgent: compactText(event.context?.dbBridgeAgentId || diagnostic.agentId || getCookie(event, 'db_bridge_agent_id'), 32),
      protocolVersion: compactText(diagnostic.protocolVersion, 24),
      upstreamStatus: Number(diagnostic.upstreamStatus || 0) || null,
      upstreamRequestId: compactText(diagnostic.upstreamRequestId, 120),
      upstreamBody: compactText(diagnostic.upstreamBody, 500),
      message: compactText(diagnostic.message || error?.message || error?.statusMessage || 'Error de API', 500)
    }

    console.error(`[AuroraDiag] ${JSON.stringify(payload)}`)
  })
})
