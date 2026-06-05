import { getAuroraExternalApiAuthDiagnostics } from '../../../../../utils/external-api-auth'

export default defineEventHandler(() => {
  const diagnostics = getAuroraExternalApiAuthDiagnostics()
  return {
    configured: diagnostics.configured,
    acceptedTokenSources: diagnostics.acceptedTokenSources,
    acceptedTokenFingerprints: diagnostics.acceptedTokenFingerprints,
    acceptedHeaders: ['Authorization: Bearer <token>', 'x-aurora-token', 'x-api-key']
  }
})
