import { runControlEscolarForAgent, updateControlEscolarStudent } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const requestQuery = getQuery(event)
  const body = await readBody(event)
  const agentIdInput = String(requestQuery.agentId || body?.agentId || '').trim()
  const id = event.context.params?.id || ''

  return await runControlEscolarForAgent(event, agentIdInput, async (agentId) => {
    const student = await updateControlEscolarStudent(agentId, id, body)
    return { success: true, student }
  })
})
