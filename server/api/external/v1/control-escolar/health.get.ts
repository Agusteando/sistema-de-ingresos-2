import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readExternalControlEscolarHealth } from '../../../../utils/control-escolar-external-view'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  return await readExternalControlEscolarHealth()
})
