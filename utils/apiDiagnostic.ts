const compactText = (value: unknown, limit = 240) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit)

const errorPayload = (error: any) => {
  const direct = error?.data
  if (direct?.data && typeof direct.data === 'object') return direct.data
  return direct && typeof direct === 'object' ? direct : {}
}

export const readApiDiagnostic = (error: any) => {
  const payload = errorPayload(error)
  const diagnostic = payload?.diagnostic && typeof payload.diagnostic === 'object'
    ? payload.diagnostic
    : payload

  return {
    status: Number(error?.statusCode || error?.status || error?.response?.status || diagnostic?.status || 0) || 0,
    code: compactText(diagnostic?.code || error?.code || '', 80),
    requestId: compactText(diagnostic?.requestId || error?.response?.headers?.get?.('x-aurora-request-id') || '', 80),
    source: compactText(diagnostic?.source || '', 80),
    plantel: compactText(diagnostic?.plantel || diagnostic?.activePlantel || '', 32),
    agentId: compactText(diagnostic?.agentId || diagnostic?.bridgeAgent || '', 32),
    message: compactText(payload?.message || diagnostic?.message || error?.message || 'Error de API')
  }
}

export const logApiDiagnostic = (scope: string, error: any, extra: Record<string, unknown> = {}) => {
  const diagnostic = readApiDiagnostic(error)
  console.error(`[AuroraDiag:${scope}]`, { ...diagnostic, ...extra })
  return diagnostic
}
