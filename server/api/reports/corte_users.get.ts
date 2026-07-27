import { runWithBridgeAgentId } from '../../utils/db'
import { loadPlantelCorteCajaUsers } from '../../utils/corte-caja'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const filters = getQuery(event)
  const user = event.context.user
  return loadPlantelCorteCajaUsers(user, filters)
}))
