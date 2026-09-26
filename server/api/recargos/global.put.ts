import { runWithBridgeAgentId } from '../../utils/db'
import { hasLateFeeRemovalAccess } from '../../../shared/utils/recargo'
import { setGlobalRecargoRemovalOverride } from '../../utils/recargo-config'

const normalizeBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const roles = user?.roles || user?.role
  const financialPlanteles = user?.financialPlantelesList || user?.financialPlanteles

  if (!hasLateFeeRemovalAccess({ roles, financialPlanteles })) {
    throw createError({
      statusCode: 403,
      message: 'Solo administradoras con acceso financiero a múltiples planteles pueden cambiar esta regla global.',
    })
  }

  const body = await readBody(event)
  if (body?.enabled === undefined || body?.enabled === null) {
    throw createError({ statusCode: 400, message: 'Indica si la excepción global debe estar activa.' })
  }

  const settings = await setGlobalRecargoRemovalOverride({
    enabled: normalizeBoolean(body.enabled),
    updatedBy: String(user?.email || user?.name || 'Sistema').trim(),
  })

  return {
    ok: true,
    settings,
  }
}))
