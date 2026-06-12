import { readCentralConceptos, readCentralConceptosConfig, buildConceptosConfigPayload, canManageConceptosConfig } from '../../utils/conceptos-config'
import { getTrustedAuthUser } from '../../utils/auth-session'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const canManage = canManageConceptosConfig(user)
  const config = await readCentralConceptosConfig()
  const conceptos = await readCentralConceptos()

  return {
    canManage,
    user: {
      email: user.email,
      role: user.role,
      roles: user.roles,
      isSuperAdmin: user.isSuperAdmin,
      activePlantel: user.active_plantel,
    },
    mappings: config.mappings,
    cycles: config.cycles,
    ...buildConceptosConfigPayload({ ...config, conceptos })
  }
})
