import { getAllowedControlEscolarAgents } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const user = event.context.user || {}
  const agents = getAllowedControlEscolarAgents(user)
  const config = useRuntimeConfig() as any
  const fixedAgentId = String(config.dbBridgeAgentId || '').trim()

  return {
    agents: agents.map(agentId => ({ agentId, plantel: agentId, label: `Plantel ${agentId}` })),
    defaultAgentId: agents.includes(String(user.active_plantel || '').trim()) ? user.active_plantel : agents[0] || '',
    bridge: {
      transport: String(config.dbTransport || 'direct'),
      fixedAgentId,
      dynamicSelection: !fixedAgentId
    }
  }
})
