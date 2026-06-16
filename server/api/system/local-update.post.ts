import { requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo un superadministrador puede instalar actualizaciones.' })
  }

  return await requestLocalSystemManager('/update', { method: 'POST' })
})
