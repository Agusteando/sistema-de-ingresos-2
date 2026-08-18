import { runWithBridgeAgentId } from '../../utils/db'
import { readDuplicateHistory } from '../../utils/student-duplicates'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  return { resolutions: await readDuplicateHistory(Number(query.limit || 50)) }
}))
