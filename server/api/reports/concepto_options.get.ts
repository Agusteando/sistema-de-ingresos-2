import { runWithBridgeAgentId } from '../../utils/db'
import { loadConceptReportOptions } from '../../utils/concept-report'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => (
  loadConceptReportOptions(event.context.user, getQuery(event))
)))
