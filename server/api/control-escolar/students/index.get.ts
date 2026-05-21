import { fetchControlEscolarStudents, resolveControlEscolarAuth, runControlEscolar } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const result = await fetchControlEscolarStudents(auth.agentId, queryParams)
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
