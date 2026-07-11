import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readExternalLiveHealth } from '../../../../utils/control-escolar-external-live'

export default defineEventHandler((event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 60)
  return readExternalLiveHealth()
})
