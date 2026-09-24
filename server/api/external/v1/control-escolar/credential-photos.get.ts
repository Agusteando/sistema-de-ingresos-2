import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readCredentialPhotoStages } from '../../../../utils/control-escolar-credential-photo-stages'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 15)
  const query=getQuery(event)
  return await readCredentialPhotoStages({
    plantel:query.plantel || query.agentId,
    ciclo:query.ciclo || query.cicloKey || query.schoolYear
  })
})
