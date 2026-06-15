import { runWithBridgeAgentId } from '../../utils/db'
import { PLANTELES_LIST } from '../../../utils/constants'
import { getTrustedAuthUser, hasFinancialAccessForPlantel, isValidPlantelScope, normalizePlantel } from '../../utils/auth-session'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
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

  if (requested !== 'GLOBAL' && (!PLANTELES_LIST.includes(requested) || (!user.isSuperAdmin && !user.plantelesList.includes(requested)))) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este plantel.' })
  }

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400 * 7
  }

  const dataBridgeAgentId = requested !== 'GLOBAL'
    ? requested
    : user.auth_home_plantel || PLANTELES_LIST[0]

  if (!dataBridgeAgentId || dataBridgeAgentId === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'No se pudo resolver un plantel de datos para bridge mode.' })
  }

  const financialAccess = hasFinancialAccessForPlantel(user.role, user.plantelesList, requested)
  const controlAccess = user.isSuperAdmin || user.hasControlEscolarRole
  const controlEscolarOnly = controlAccess && !financialAccess

  setCookie(event, 'auth_role', user.role || 'ROLE_CTRL', cookieOpts)
  setCookie(event, 'auth_planteles', user.isSuperAdmin ? PLANTELES_LIST.join(',') : user.planteles, cookieOpts)
  setCookie(event, 'auth_financial_planteles', user.isSuperAdmin ? PLANTELES_LIST.join(',') : user.financialPlanteles, cookieOpts)
  setCookie(event, 'auth_active_plantel', requested, cookieOpts)
  setCookie(event, 'auth_home_plantel', user.auth_home_plantel || dataBridgeAgentId, cookieOpts)
  setCookie(event, 'auth_nav_mode', controlEscolarOnly ? 'control-escolar' : 'financial', cookieOpts)
  setCookie(event, 'auth_has_control_escolar', controlAccess ? 'true' : 'false', cookieOpts)
  setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', cookieOpts)
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })
  setCookie(event, 'db_bridge_agent_id', dataBridgeAgentId, cookieOpts)

  event.context.dbBridgeAgentId = dataBridgeAgentId

  return {
    success: true,
    activePlantel: requested,
    dataBridgeAgentId,
    financialAccess,
    redirectTo: financialAccess ? '/' : '/control-escolar'
  }
}))
