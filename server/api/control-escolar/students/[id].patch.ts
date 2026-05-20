import { patchControlEscolarStudent, runControlEscolarQuery } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const params = getQuery(event)
  const id = String(event.context.params?.id || '')
  const body = await readBody(event)

  return await runControlEscolarQuery(event, body?.agentId || params.agentId, async ({ agentId, user }) => {
    return {
      success: true,
      student: await patchControlEscolarStudent(agentId, id, body?.fields || body || {}, user)
    }
  })
})
