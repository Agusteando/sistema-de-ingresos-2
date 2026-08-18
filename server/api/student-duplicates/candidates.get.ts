import { runWithBridgeAgentId } from '../../utils/db'
import { readDuplicateCandidates } from '../../utils/student-duplicates'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const requestQuery = getQuery(event)
  const countOnly = ['1', 'true', 'yes'].includes(String(requestQuery.countOnly || '').toLowerCase())
  const allCandidates = await readDuplicateCandidates(0)

  if (countOnly) return { count: allCandidates.length }

  const limit = Math.max(1, Math.min(250, Number(requestQuery.limit || 100)))
  return {
    count: allCandidates.length,
    candidates: allCandidates.slice(0, limit),
  }
}))
