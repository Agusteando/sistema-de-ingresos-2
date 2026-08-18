import { runWithBridgeAgentId } from '../../utils/db'
import { ignoreDuplicatePair } from '../../utils/student-duplicates'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  return await ignoreDuplicatePair(body?.matriculaA, body?.matriculaB, event.context.user?.email || event.context.user?.name)
}))
