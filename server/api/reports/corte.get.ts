import { runWithBridgeAgentId } from '../../utils/db'
import { loadCurrentUserCorteCaja } from '../../utils/corte-caja'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const filters = getQuery(event)
  const user = event.context.user
  const result = await loadCurrentUserCorteCaja(user, filters)
  return result.grouped
}))
