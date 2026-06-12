import { getTrustedAuthUser } from '../../../utils/auth-session'
import { saveCycle } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) throw createError({ statusCode: 403, message: 'Solo super admin puede administrar ciclos.' })
  const body = await readBody(event)
  return await saveCycle(body?.ciclo, user.email)
})
