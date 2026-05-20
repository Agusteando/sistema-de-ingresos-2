import { getControlEscolarKpis, runControlEscolarQuery } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const params = getQuery(event)
  return await runControlEscolarQuery(event, params.agentId, async ({ agentId }) => {
    return await getControlEscolarKpis(agentId, params.ciclo)
  })
})
