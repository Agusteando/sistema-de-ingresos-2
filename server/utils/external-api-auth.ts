import { createHash } from 'node:crypto'

const normalizeToken = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const unquoted = raw.replace(/^['\"]|['\"]$/g, '').trim()
  return unquoted.replace(/^Bearer\s+/i, '').trim()
}

const fingerprintToken = (value: string) => {
  if (!value) return ''
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

const getEventHeaderMap = (event: any) => {
  const headers = getRequestHeaders(event) || {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    result[String(key).toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value || '')
  }
  return result
}

const getHeaderValue = (event: any, name: string) => {
  const fromHeader = getHeader(event, name)
  if (fromHeader) return String(fromHeader)
  return getEventHeaderMap(event)[name.toLowerCase()] || ''
}

const getIncomingTokenDetails = (event: any) => {
  const headers = getEventHeaderMap(event)
  const auth = String(headers.authorization || getHeaderValue(event, 'authorization') || '').trim()
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  const xAurora = getHeaderValue(event, 'x-aurora-token')
  const xApiKey = getHeaderValue(event, 'x-api-key')
  const queryToken = getQuery(event)?.token

  const candidates: Array<{ source: string, value: unknown }> = [
    { source: 'authorization', value: bearer },
    { source: 'x-aurora-token', value: xAurora },
    { source: 'x-api-key', value: xApiKey },
    { source: 'query.token', value: queryToken }
  ]

  const match = candidates.find((candidate) => normalizeToken(candidate.value))
  const token = normalizeToken(match?.value)

  return {
    token,
    source: match?.source || null,
    fingerprint: fingerprintToken(token),
    headersPresent: {
      authorization: Boolean(headers.authorization || getHeaderValue(event, 'authorization')),
      xAuroraToken: Boolean(headers['x-aurora-token'] || getHeaderValue(event, 'x-aurora-token')),
      xApiKey: Boolean(headers['x-api-key'] || getHeaderValue(event, 'x-api-key'))
    },
    authorizationScheme: auth ? (auth.split(/\s+/)[0] || null) : null
  }
}

const readTokenFromEvent = (event: any) => getIncomingTokenDetails(event).token

const collectExpectedTokens = () => {
  const config = useRuntimeConfig() as any
  const candidates: Array<{ source: string, value: string }> = [
    { source: 'AURORA_API_TOKEN', value: normalizeToken(process.env.AURORA_API_TOKEN) },
    { source: 'HUSKY_PASS_AURORA_API_TOKEN', value: normalizeToken(process.env.HUSKY_PASS_AURORA_API_TOKEN) },
    // Compatibility fallback: this is the SIPAE-side name, but accepting it in Aurora
    // prevents a production outage when both Vercel projects were configured with the same key name.
    { source: 'AURORA_STUDENTS_API_TOKEN', value: normalizeToken(process.env.AURORA_STUDENTS_API_TOKEN) },
    { source: 'EXTERNAL_CONTROL_ESCOLAR_API_TOKEN', value: normalizeToken(process.env.EXTERNAL_CONTROL_ESCOLAR_API_TOKEN) },
    { source: 'runtimeConfig.auroraApiToken', value: normalizeToken(config.auroraApiToken) },
    { source: 'runtimeConfig.externalControlEscolarApiToken', value: normalizeToken(config.externalControlEscolarApiToken) }
  ]

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (!candidate.value || seen.has(candidate.value)) return false
    seen.add(candidate.value)
    return true
  })
}

export const getAuroraExternalApiAuthDiagnostics = () => {
  const expected = collectExpectedTokens()
  return {
    configured: expected.length > 0,
    acceptedTokenSources: expected.map((item) => item.source),
    acceptedTokenFingerprints: expected.map((item) => fingerprintToken(item.value))
  }
}

export const getAuroraExternalApiRequestAuthDiagnostics = (event: any) => {
  const expected = collectExpectedTokens()
  const incoming = getIncomingTokenDetails(event)
  const matchedSource = expected.find((candidate) => candidate.value === incoming.token)?.source || null
  return {
    configured: expected.length > 0,
    acceptedTokenSources: expected.map((item) => item.source),
    acceptedTokenFingerprints: expected.map((item) => fingerprintToken(item.value)),
    receivedTokenPresent: Boolean(incoming.token),
    receivedTokenSource: incoming.source,
    receivedTokenFingerprint: incoming.fingerprint || null,
    matched: Boolean(matchedSource),
    matchedTokenSource: matchedSource,
    headersPresent: incoming.headersPresent,
    authorizationScheme: incoming.authorizationScheme,
    acceptedHeaders: ['Authorization: Bearer <token>', 'x-aurora-token', 'x-api-key']
  }
}

export const assertAuroraExternalApiToken = (event: any) => {
  const expected = collectExpectedTokens()

  if (!expected.length) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_API_TOKEN_NOT_CONFIGURED',
      message: 'La API externa de Aurora no está habilitada. Configura AURORA_API_TOKEN en las variables de entorno de Aurora.',
      data: {
        code: 'AURORA_API_TOKEN_NOT_CONFIGURED',
        acceptedEnvVars: ['AURORA_API_TOKEN', 'HUSKY_PASS_AURORA_API_TOKEN', 'EXTERNAL_CONTROL_ESCOLAR_API_TOKEN']
      }
    })
  }

  const incoming = getIncomingTokenDetails(event)
  const received = incoming.token
  const match = expected.find((candidate) => candidate.value === received)

  if (!received || !match) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AURORA_API_UNAUTHORIZED',
      message: 'Acceso no autorizado.',
      data: {
        code: 'AURORA_API_UNAUTHORIZED',
        receivedTokenPresent: Boolean(received),
        receivedTokenSource: incoming.source,
        receivedTokenFingerprint: fingerprintToken(received),
        expectedTokenConfigured: true,
        acceptedTokenSources: expected.map((item) => item.source),
        acceptedTokenFingerprints: expected.map((item) => fingerprintToken(item.value)),
        headersPresent: incoming.headersPresent,
        authorizationScheme: incoming.authorizationScheme,
        acceptedHeaders: ['Authorization: Bearer <token>', 'x-aurora-token', 'x-api-key']
      }
    })
  }

  return {
    authenticated: true,
    source: match.source,
    tokenFingerprint: fingerprintToken(match.value)
  }
}

export const setExternalApiResponseHeaders = (event: any, cacheSeconds = 60) => {
  setResponseHeader(event, 'Cache-Control', `private, max-age=${Math.max(0, cacheSeconds)}`)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
}
