const readTokenFromEvent = (event: any) => {
  const auth = String(getHeader(event, 'authorization') || '').trim()
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  return (
    bearer ||
    String(getHeader(event, 'x-aurora-token') || '').trim() ||
    String(getHeader(event, 'x-api-key') || '').trim() ||
    String(getQuery(event)?.token || '').trim()
  )
}

export const assertAuroraExternalApiToken = (event: any) => {
  const config = useRuntimeConfig() as any
  const expected = String(config.auroraApiToken || config.externalControlEscolarApiToken || '').trim()

  if (!expected) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_API_TOKEN_NOT_CONFIGURED',
      message: 'La API externa de Aurora no está habilitada. Configura AURORA_API_TOKEN en .env.'
    })
  }

  const received = readTokenFromEvent(event)
  if (!received || received !== expected) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AURORA_API_UNAUTHORIZED',
      message: 'Token inválido o ausente para la API externa de Aurora.'
    })
  }

  return { authenticated: true }
}

export const setExternalApiResponseHeaders = (event: any, cacheSeconds = 60) => {
  setResponseHeader(event, 'Cache-Control', `private, max-age=${Math.max(0, cacheSeconds)}`)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
}
