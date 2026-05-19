import { getControlEscolarAllowedAgentIds } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const allowed = getControlEscolarAllowedAgentIds(user)
  const activePlantel = String(user?.active_plantel || '').trim().toUpperCase()
  const selected = allowed.includes(activePlantel) ? activePlantel : allowed[0] || ''

  return {
    selected,
    agents: allowed.map(agentId => ({ agentId, plantel: agentId, label: `Plantel ${agentId}` }))
  }
})
