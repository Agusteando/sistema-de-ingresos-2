import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../../utils/external-api-auth'
import { readSummerStudentPhoto } from '../../../../../../utils/summer-external'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 900)
  return await readSummerStudentPhoto(getRouterParam(event, 'matricula'))
})
