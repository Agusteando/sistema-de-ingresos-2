import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readExternalHuskyPassAccount } from '../../../../utils/external-husky-pass-account'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  return await readExternalHuskyPassAccount(getQuery(event))
})
