import { fetchControlEscolarStudents, resolveControlEscolarAuth, runControlEscolar } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const result = await fetchControlEscolarStudents(auth.agentId, queryParams)
      return { agentId: auth.agentId, ...result }
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: error?.name === 'AbortError' ? 504 : 502,
        message: error?.message || 'No se pudieron cargar alumnos de Control Escolar para este plantel.'
      })
    }
  })
})
