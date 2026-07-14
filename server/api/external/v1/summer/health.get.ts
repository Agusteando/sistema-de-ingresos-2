import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readSummerExternalHealth } from '../../../../utils/summer-external'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  return await readSummerExternalHealth(getQuery(event).plantel)
})
