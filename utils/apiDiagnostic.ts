const compactText = (value: unknown, limit = 240) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit)

const objectValue = (value: unknown): Record<string, any> | null => (
  value && typeof value === 'object' ? value as Record<string, any> : null
)

const diagnosticCandidates = (error: any) => [
  objectValue(error?.data?.data?.diagnostic),
  objectValue(error?.data?.diagnostic),
  objectValue(error?.response?._data?.data?.diagnostic),
  objectValue(error?.response?._data?.diagnostic),
  objectValue(error?.response?.data?.data?.diagnostic),
  objectValue(error?.response?.data?.diagnostic),
  objectValue(error?.diagnostic),
].filter(Boolean) as Record<string, any>[]

const payloadCandidates = (error: any) => [
  objectValue(error?.data?.data),
  objectValue(error?.data),
  objectValue(error?.response?._data?.data),
  objectValue(error?.response?._data),
  objectValue(error?.response?.data?.data),
  objectValue(error?.response?.data),
].filter(Boolean) as Record<string, any>[]

export const readApiDiagnostic = (error: any) => {
  const diagnostic = diagnosticCandidates(error)[0] || {}
  const payload = payloadCandidates(error)[0] || {}
  const responseHeaders = error?.response?.headers

  return {
    status: Number(
      diagnostic?.status ||
      error?.statusCode ||
      error?.status ||
      error?.response?.status ||
      payload?.statusCode ||
      payload?.status ||
      0
    ) || 0,
    code: compactText(diagnostic?.code || payload?.code || error?.code || '', 80),
    requestId: compactText(
      diagnostic?.requestId ||
      payload?.requestId ||
      responseHeaders?.get?.('x-aurora-request-id') ||
      '',
      80
    ),
    source: compactText(diagnostic?.source || payload?.source || '', 80),
    plantel: compactText(diagnostic?.plantel || diagnostic?.activePlantel || payload?.plantel || '', 32),
    agentId: compactText(diagnostic?.agentId || diagnostic?.bridgeAgent || payload?.agentId || '', 32),
    message: compactText(
      diagnostic?.message ||
      payload?.message ||
      error?.message ||
      error?.statusMessage ||
      'Error de API'
    )
  }
}

export const logApiDiagnostic = (scope: string, error: any, extra: Record<string, unknown> = {}) => {
  const diagnostic = readApiDiagnostic(error)
  console.error(`[AuroraDiag:${scope}]`, { scope, ...diagnostic, ...extra })
  return diagnostic
}
