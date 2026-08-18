import { runWithBridgeAgentId } from '../../utils/db'
import { mergeDuplicateStudents } from '../../utils/student-duplicates'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  return await mergeDuplicateStudents(body?.winner, body?.loser, event.context.user?.email || event.context.user?.name)
}))
