import { getTrustedAuthUser } from '../../../utils/auth-session'
import { createSharedConceptLink } from '../../../utils/public-concept-links'

export default defineEventHandler(async event => {
  const user = await getTrustedAuthUser(event)
  const id = await createSharedConceptLink(await readBody(event), user)
  return { id }
})
