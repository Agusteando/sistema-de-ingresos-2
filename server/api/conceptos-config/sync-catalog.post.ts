import { getTrustedAuthUser } from '../../utils/auth-session'
import { importLocalConceptosToCentral } from '../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede sincronizar conceptos.' })
  }
  const body = await readBody(event).catch(() => ({}))
  return await importLocalConceptosToCentral(user.email, {
    ciclo: body?.ciclo,
    plantel: body?.plantel
  })
})
