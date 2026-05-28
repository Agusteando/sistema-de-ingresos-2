import { fetchControlEscolarStudents, refreshVerifiedControlEscolarCacheForScope, resolveControlEscolarAuth, runControlEscolar } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const result = await fetchControlEscolarStudents(auth.agentId, queryParams)
      const source: any = result?.source || {}
      if (source.cacheRefreshDue && source.cacheRows > 0) {
        const refreshPromise = refreshVerifiedControlEscolarCacheForScope(auth.agentId, queryParams).catch((error: any) => {
          console.warn('[Control Escolar Cache] Background refresh after stale cache read failed.', {
            plantel: auth.agentId,
            message: error?.message || error
          })
        })
        const waitUntil = (event as any).waitUntil
        if (typeof waitUntil === 'function') waitUntil.call(event, refreshPromise)
        else void refreshPromise
      }
      return { agentId: auth.agentId, ...result }
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.httpStatus || (error?.name === 'AbortError' ? 504 : 502)
      const message = error?.data?.message || error?.statusMessage || error?.message || 'No se pudieron cargar alumnos de Control Escolar para este plantel.'
      const safeMessage = String(message).slice(0, 500)

      setResponseStatus(event, statusCode, safeMessage)
      return {
        error: true,
        statusCode,
        statusMessage: safeMessage,
        message: safeMessage,
        code: error?.code || null,
        bridgeStatus: error?.httpStatus || null,
        agentId: auth.agentId
      }
    }
  })
})
