import { runWithBridgeAgentId } from '../../utils/db'
import { reverseDuplicateResolution } from '../../utils/student-duplicates'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  return await reverseDuplicateResolution(body?.resolutionKey, event.context.user?.email || event.context.user?.name)
}))
