import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readSummerStudentsFromBridge } from '../../../../../utils/summer-external'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'X-Aurora-Summer-Query-Version', '3')
  const query = getQuery(event)
  const planteles = query.planteles || query.plantel || query.agentId
  return await readSummerStudentsFromBridge(planteles, query.cycle || query.ciclo || query.year, query.concepts)
})
