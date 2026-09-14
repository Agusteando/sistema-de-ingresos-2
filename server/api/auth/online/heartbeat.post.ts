import { getTrustedAuthUser } from '../../../utils/auth-session'
import { touchOnlinePresence } from '../../../utils/online-presence'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const presence = touchOnlinePresence(event, user)

  return {
    ok: true,
    lastSeenAt: new Date(presence.lastSeenAt).toISOString()
  }
})
