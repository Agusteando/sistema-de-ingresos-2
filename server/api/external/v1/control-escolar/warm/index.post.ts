import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { warmExternalControlEscolarStudentScopes } from '../../../../../utils/control-escolar-external-view'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  const body = await readBody(event).catch(() => ({}))
  const query = getQuery(event)
  return await warmExternalControlEscolarStudentScopes({ ...query, ...body })
})
