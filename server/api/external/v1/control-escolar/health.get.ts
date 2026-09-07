import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readExternalControlEscolarHealth } from '../../../../utils/control-escolar-external-view'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 60)
  return await readExternalControlEscolarHealth()
})
