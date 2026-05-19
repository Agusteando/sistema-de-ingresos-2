import { getControlEscolarKpis, runControlEscolarForAgent } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const requestQuery = getQuery(event)

  return await runControlEscolarForAgent(event, requestQuery.agentId as string, async (agentId) => {
    return await getControlEscolarKpis(agentId, requestQuery.ciclo as string)
  })
})
