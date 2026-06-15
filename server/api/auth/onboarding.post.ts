import { PLANTELES_LIST } from '../../../utils/constants'
import { getTrustedAuthUser, hasFinancialAccessForPlantel, normalizePlantel } from '../../utils/auth-session'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = await getTrustedAuthUser(event)
  const requestedPlanteles = Array.isArray(body?.planteles)
    ? body.planteles.map(normalizePlantel).filter((plantel: string) => PLANTELES_LIST.includes(plantel))
    : []
  const allowedPlanteles = user.isSuperAdmin ? [...PLANTELES_LIST] : [...user.plantelesList]
  const activePlantel = requestedPlanteles.find((plantel: string) => allowedPlanteles.includes(plantel))
    || (allowedPlanteles.includes(user.active_plantel) ? user.active_plantel : allowedPlanteles[0])
    || PLANTELES_LIST[0]
  const financialAccess = hasFinancialAccessForPlantel(user.role, user.plantelesList, activePlantel)
  const controlAccess = user.isSuperAdmin || user.hasControlEscolarRole
  const redirectTo = financialAccess ? '/' : '/control-escolar'

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400 * 7,
    sameSite: 'lax' as const
  }

  setCookie(event, 'auth_planteles', allowedPlanteles.join(','), cookieOpts)
  setCookie(event, 'auth_active_plantel', activePlantel, cookieOpts)
  setCookie(event, 'auth_home_plantel', activePlantel, cookieOpts)
  setCookie(event, 'auth_financial_planteles', user.financialPlanteles, cookieOpts)
  setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', cookieOpts)
  setCookie(event, 'auth_has_control_escolar', controlAccess ? 'true' : 'false', cookieOpts)
  setCookie(event, 'auth_nav_mode', financialAccess ? 'financial' : 'control-escolar', cookieOpts)
  setCookie(event, 'db_bridge_agent_id', activePlantel, cookieOpts)

  return { success: true, activePlantel, financialAccess, redirectTo }
})
