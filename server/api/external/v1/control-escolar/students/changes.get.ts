import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalControlEscolarChanges } from '../../../../../utils/control-escolar-external-view'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  return await readExternalControlEscolarChanges(getQuery(event))
})
