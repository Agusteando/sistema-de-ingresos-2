import { fetchControlEscolarKpis, resolveControlEscolarAuth, runControlEscolar } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const { agentId } = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const kpis = await fetchControlEscolarKpis(auth.agentId, getQuery(event))
      return { agentId: auth.agentId, kpis }
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: error?.name === 'AbortError' ? 504 : 502,
        message: error?.message || 'No se pudieron cargar los KPIs de Control Escolar para este plantel.'
      })
    }
  })
})
