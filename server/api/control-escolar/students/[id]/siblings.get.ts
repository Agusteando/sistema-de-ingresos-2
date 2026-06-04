import { fetchControlEscolarSiblingsByParentNames, resolveControlEscolarAuth, runControlEscolar } from '../../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const matricula = String(event.context.params?.id || '').trim()

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      return await fetchControlEscolarSiblingsByParentNames(auth.agentId, matricula, queryParams)
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: error?.name === 'AbortError' ? 504 : 502,
        message: error?.message || 'No se pudieron calcular hermanos desde Control Escolar.'
      })
    }
  })
})
