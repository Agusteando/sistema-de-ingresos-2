import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalSnapshotStudentDetail } from '../../../../../utils/control-escolar-external-snapshot'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  return await readExternalSnapshotStudentDetail(getQuery(event), getRouterParam(event, 'matricula'))
})
