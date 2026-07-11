import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalLiveStudents } from '../../../../../utils/control-escolar-external-live'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  return await readExternalLiveStudents(event, getQuery(event))
})
