import { PLANTELES_LIST } from '../../../utils/constants'
import { getTrustedAuthUser, isValidPlantelScope, normalizePlantel } from '../../utils/auth-session'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = await getTrustedAuthUser(event)
  const requested = normalizePlantel(body?.plantel)

  if (!requested) {
    throw createError({ statusCode: 400, message: 'Plantel requerido.' })
  }

  if (!isValidPlantelScope(requested)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  }

  if (requested === 'GLOBAL' && !user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para vista consolidada.' })
  }

  if (requested !== 'GLOBAL' && !user.isSuperAdmin && !user.plantelesList.includes(requested)) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este plantel.' })
  }

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400 * 7
  }

  setCookie(event, 'auth_role', user.role || 'plantel', cookieOpts)
  setCookie(event, 'auth_planteles', user.isSuperAdmin ? PLANTELES_LIST.join(',') : user.planteles, cookieOpts)
  setCookie(event, 'auth_active_plantel', requested, cookieOpts)
  setCookie(event, 'auth_home_plantel', user.auth_home_plantel, cookieOpts)

  if (requested !== 'GLOBAL') {
    setCookie(event, 'db_bridge_agent_id', requested, cookieOpts)
  }

  return { success: true, activePlantel: requested }
})
