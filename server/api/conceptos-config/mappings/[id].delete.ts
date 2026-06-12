import { getTrustedAuthUser } from '../../../utils/auth-session'
import { deleteConceptMapping } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede administrar conceptos.' })
  }
  return await deleteConceptMapping(Number(getRouterParam(event, 'id') || 0), user.email)
})
