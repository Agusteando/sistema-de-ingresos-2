import { fetchControlEscolarKpis, resolveControlEscolarAuth, runControlEscolar } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const { agentId } = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const kpis = await fetchControlEscolarKpis(auth.agentId, getQuery(event))
      return { agentId: auth.agentId, kpis }
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.httpStatus || (error?.name === 'AbortError' ? 504 : 502)
      const message = error?.data?.message || error?.statusMessage || error?.message || 'No se pudieron cargar los KPIs de Control Escolar para este plantel.'
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
