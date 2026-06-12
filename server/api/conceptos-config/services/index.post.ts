import { getTrustedAuthUser } from '../../../utils/auth-session'
import { createService, syncCentralConceptConfigToBridge } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede administrar servicios.' })
  }
  const body = await readBody(event)
  const service = await createService(body, user.email)
  await syncCentralConceptConfigToBridge({})
  return { success: true, service }
})
