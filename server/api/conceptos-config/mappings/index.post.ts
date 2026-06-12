import { getTrustedAuthUser } from '../../../utils/auth-session'
import { saveConceptMapping } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede administrar conceptos.' })
  }
  const body = await readBody(event)
  return await saveConceptMapping(body, user.email)
})
