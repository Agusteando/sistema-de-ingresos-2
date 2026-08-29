import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalCalculatedAcademicPlacement } from '../../../../../utils/control-escolar-external-live'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  return await readExternalCalculatedAcademicPlacement(event, getQuery(event), getRouterParam(event, 'matricula'))
})
