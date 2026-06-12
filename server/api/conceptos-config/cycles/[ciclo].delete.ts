import { deleteCycle, requireConceptosAdmin } from '../../../utils/conceptos-config'
import { resolveDataBridgeAgentId } from '../../../utils/auth-session'
import { runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const bridgeAgentId = resolveDataBridgeAgentId(event, user)

  return await runWithBridgeAgentId(bridgeAgentId, async () => await deleteCycle(getRouterParam(event, 'ciclo')))
})
