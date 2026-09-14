import { getTrustedAuthUser } from '../../utils/auth-session'
import { listOnlineUsers, touchOnlinePresence } from '../../utils/online-presence'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede consultar usuarios en línea.' })
  }

  touchOnlinePresence(event, user)
  return {
    ok: true,
    ...listOnlineUsers()
  }
})
