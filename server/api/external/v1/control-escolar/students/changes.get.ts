import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalSnapshotChanges } from '../../../../../utils/control-escolar-external-snapshot'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  return await readExternalSnapshotChanges(getQuery(event))
})
