import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalControlEscolarStudentDetail } from '../../../../../utils/control-escolar-external-view'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 60)
  return await readExternalControlEscolarStudentDetail(getQuery(event), getRouterParam(event, 'matricula'))
})
