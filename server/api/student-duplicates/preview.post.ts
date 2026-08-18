import { runWithBridgeAgentId } from '../../utils/db'
import { readDuplicatePreview } from '../../utils/student-duplicates'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const body = await readBody(event)
  return await readDuplicatePreview(body?.matriculaA, body?.matriculaB)
}))
