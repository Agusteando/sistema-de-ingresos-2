import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalResilientStudents } from '../../../../../utils/control-escolar-external-resilient'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  return await readExternalResilientStudents(event, getQuery(event))
})
