import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readSummerStudentsFromBridge } from '../../../../../utils/summer-external'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  return await readSummerStudentsFromBridge(query.plantel || query.agentId, query.cycle || query.ciclo || query.year, query.concepts)
})
