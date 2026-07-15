import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { diagnoseSummerStudentsFromBridge } from '../../../../utils/summer-external'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'X-Aurora-Summer-Diagnostics-Version', '1')
  const query = getQuery(event)
  return await diagnoseSummerStudentsFromBridge(query.plantel || query.agentId, query.cycle || query.ciclo || query.year, query.concepts)
})
