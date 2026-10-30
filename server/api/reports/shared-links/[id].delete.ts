import { getTrustedAuthUser } from '../../../utils/auth-session'
import { revokeSharedConceptLink } from '../../../utils/public-concept-links'

export default defineEventHandler(async event => {
  const id = String(getRouterParam(event, 'id') || '')
  await revokeSharedConceptLink(id, await getTrustedAuthUser(event))
  return { ok: true }
})
