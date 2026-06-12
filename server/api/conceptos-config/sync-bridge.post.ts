import { getTrustedAuthUser } from '../../utils/auth-session'
import { syncCentralConceptConfigToBridge } from '../../utils/conceptos-config'
import { runWithBridgeAgentId } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede sincronizar conceptos.' })
  }
  const body = await readBody(event).catch(() => ({}))
  return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => await syncCentralConceptConfigToBridge({
    ciclo: body?.ciclo,
    plantel: body?.plantel
  }))
})
