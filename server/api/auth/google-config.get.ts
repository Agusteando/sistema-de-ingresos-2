import { getRuntimeGoogleClientId } from '../../utils/google-client-id'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')
  return { clientId: getRuntimeGoogleClientId() }
})
