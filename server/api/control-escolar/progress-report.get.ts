import {
  fetchControlEscolarProgressReport,
  resolveControlEscolarAuth,
  runControlEscolar,
} from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const report = await fetchControlEscolarProgressReport(auth.agentId, queryParams)
      return { agentId: auth.agentId, report }
    } catch (error: any) {
      const errorData = error?.data || {}
      const statusCode = error?.statusCode || error?.httpStatus || (error?.name === 'AbortError' ? 504 : 502)
      const message = errorData?.message || error?.statusMessage || error?.message || 'No se pudo calcular el avance de Control Escolar para este plantel.'
      const safeMessage = String(message).slice(0, 500)

      setResponseStatus(event, statusCode, safeMessage)
      return {
        error: true,
        statusCode,
        statusMessage: safeMessage,
        message: safeMessage,
        code: error?.code || errorData?.code || errorData?.data?.code || null,
        bridgeStatus: error?.httpStatus || null,
        agentId: auth.agentId,
      }
    }
  })
})
