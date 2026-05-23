import { getExternalUsersDiagnostics } from '../../utils/external-users'

export default defineEventHandler(async (event) => {
  const user = event.context.user

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  return await getExternalUsersDiagnostics()
})
