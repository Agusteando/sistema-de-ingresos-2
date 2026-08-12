import { runWithBridgeAgentId } from '../../utils/db'
import { loadConceptReportUsers } from '../../utils/concept-report'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => (
  loadConceptReportUsers(event.context.user, getQuery(event))
)))
