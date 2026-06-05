import { getAuroraExternalApiRequestAuthDiagnostics, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'

export default defineEventHandler((event) => {
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return getAuroraExternalApiRequestAuthDiagnostics(event)
})
