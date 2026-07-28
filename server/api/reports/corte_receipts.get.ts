import { runWithBridgeAgentId } from '../../utils/db'
import { loadPlantelCorteReceiptStrips } from '../../utils/corte-receipts'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const filters = getQuery(event)
  const user = event.context.user
  return loadPlantelCorteReceiptStrips(user, filters)
}))
