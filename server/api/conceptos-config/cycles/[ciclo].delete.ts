import { getTrustedAuthUser } from '../../../utils/auth-session'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { syncCentralConceptConfigToBridge } from '../../../utils/conceptos-config'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin) throw createError({ statusCode: 403, message: 'Solo super admin puede administrar ciclos.' })
  const ciclo = normalizeCicloKey(getRouterParam(event, 'ciclo'))
  if (!ciclo) throw createError({ statusCode: 400, message: 'Ciclo requerido.' })
  await controlEscolarCentralQuery<any>(`DELETE FROM config_school_cycles WHERE cycle_name = ?`, [ciclo])
  await syncCentralConceptConfigToBridge({})
  return { success: true }
})
