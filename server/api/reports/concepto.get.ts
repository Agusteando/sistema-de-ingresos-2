import { runWithBridgeAgentId } from '../../utils/db'
import { loadConceptReport } from '../../utils/concept-report'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => (
  loadConceptReport(event.context.user, getQuery(event))
)))
