import { resolveControlEscolarAuth, runControlEscolar, updateControlEscolarStudent } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const { agentId } = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, agentId)
  const matricula = String(event.context.params?.id || '').trim()
  const body = await readBody(event)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      return await updateControlEscolarStudent(auth.agentId, matricula, body, auth.user)
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: error?.name === 'AbortError' ? 504 : 502,
        message: error?.message || 'No se pudo guardar la ficha de Control Escolar.'
      })
    }
  })
})
