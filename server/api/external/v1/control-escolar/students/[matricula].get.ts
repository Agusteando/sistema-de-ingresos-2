import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalLiveStudentDetail } from '../../../../../utils/control-escolar-external-live'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  return await readExternalLiveStudentDetail(event, getQuery(event), getRouterParam(event, 'matricula'))
})
