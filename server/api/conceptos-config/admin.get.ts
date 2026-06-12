import { getTrustedAuthUser } from '../../utils/auth-session'
import { readAdminDashboard } from '../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede administrar conceptos.' })
  }
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')
  const { ciclo = '', plantel = '', categoria = '' } = getQuery(event)
  return await readAdminDashboard({
    ciclo: String(ciclo || ''),
    plantel: String(plantel || ''),
    categoria: String(categoria || '')
  })
})
