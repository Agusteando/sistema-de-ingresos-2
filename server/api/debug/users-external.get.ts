import { getExternalUsersDiagnostics } from '../../utils/external-users'
import { getTrustedAuthUser } from '../../utils/auth-session'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  return await getExternalUsersDiagnostics()
})
