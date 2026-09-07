import { getRuntimeGoogleClientId } from '../utils/google-client-id'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const clientId = getRuntimeGoogleClientId()

  if (clientId) config.public.googleClientId = clientId
})
