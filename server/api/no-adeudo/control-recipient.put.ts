import { setNoAdeudoControlUserForPlantel } from '../../utils/external-users'
import { normalizePlantel } from '../../utils/auth-session'

const canManagePlantel = (event: any, plantel: string) => {
  const user = event.context.user
  if (!user) return false
  if (user.isSuperAdmin) return true
  const active = normalizePlantel(user.active_plantel || user.plantel)
  if (active && active === plantel) return true
  const planteles = String(user.planteles || '')
    .split(',')
    .map(normalizePlantel)
    .filter(Boolean)
  return planteles.includes(plantel)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const plantel = normalizePlantel(body?.plantel)
  if (!plantel) throw createError({ statusCode: 400, message: 'Plantel requerido.' })
  if (!canManagePlantel(event, plantel)) {
    throw createError({ statusCode: 403, message: 'No tienes permisos para configurar Control Escolar de este plantel.' })
  }

  return await setNoAdeudoControlUserForPlantel(plantel, body?.userId || body?.id || '')
})
