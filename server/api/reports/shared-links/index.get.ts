import { getTrustedAuthUser } from '../../../utils/auth-session'
import { listSharedConceptLinks, requireSharedConceptManager } from '../../../utils/public-concept-links'

export default defineEventHandler(async event => {
  requireSharedConceptManager(await getTrustedAuthUser(event))
  return { links: await listSharedConceptLinks() }
})
