import {
  getTrustedAuthUser,
  hasControlEscolarRole,
  hasFinancialAccessForPlantel,
  isSuperAdminRole,
  normalizeAuthRole,
  normalizePlantel,
  parsePlanteles
} from '../../../utils/auth-session'
import { findExternalAuthUserByEmail } from '../../../utils/external-users'
import { checkBridgeAgentAvailability } from '../../../utils/db'
import { createImpersonationToken, impersonatedAuthCookieOptions, impersonationCookieOptions } from '../../../utils/impersonation-session'
import { setAuthSessionToken } from '../../../utils/auth-session-token'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export default defineEventHandler(async (event) => {
  const currentUser = await getTrustedAuthUser(event)
  if (!currentUser.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo un superadministrador puede usar esta función.' })
  }

  if (getCookie(event, 'auth_impersonation_token')) {
    throw createError({ statusCode: 409, message: 'Ya existe una vista de usuario activa.' })
  }

  const body = await readBody(event)
  const email = normalizeEmail(body?.email)
  if (!email) {
    throw createError({ statusCode: 400, message: 'Correo requerido.' })
  }
  if (email === currentUser.email) {
    throw createError({ statusCode: 400, message: 'No puede iniciar una vista sobre su propia cuenta.' })
  }

  const target = await findExternalAuthUserByEmail(email)
  if (!target) {
    throw createError({ statusCode: 404, message: 'Usuario no encontrado.' })
  }
  if (target.ingresosBlocked || Number(target.ingresos_blocked || 0) === 1) {
    throw createError({ statusCode: 409, message: 'No se puede abrir la vista de una cuenta bloqueada.' })
  }

  const role = normalizeAuthRole(target.role)
  if (isSuperAdminRole(role)) {
    throw createError({ statusCode: 400, message: 'No es necesario suplantar otra cuenta superadministradora.' })
  }

  const planteles = parsePlanteles(target.plantel)
  if (!planteles.length) {
    throw createError({ statusCode: 409, message: 'El usuario no tiene planteles asignados.' })
  }

  const requestedPlantel = normalizePlantel(body?.plantel)
  if (requestedPlantel && !planteles.includes(requestedPlantel)) {
    throw createError({ statusCode: 403, message: 'El usuario no tiene acceso al plantel seleccionado.' })
  }

  const currentPlantel = normalizePlantel(currentUser.active_plantel)
  const activePlantel = requestedPlantel || (planteles.includes(currentPlantel) ? currentPlantel : planteles[0])
  const controlAccess = hasControlEscolarRole(role)
  const financialPlanteles = planteles.filter((plantel) => hasFinancialAccessForPlantel(role, planteles, plantel))
  const financialAccess = hasFinancialAccessForPlantel(role, planteles, activePlantel)
  const controlEscolarOnly = controlAccess && !financialAccess

  if (financialAccess) {
    const availability = await checkBridgeAgentAvailability(activePlantel, { timeoutMs: 3500 })
    if (!availability.online) {
      const requestId = String(event.context?.auroraRequestId || '')
      throw createError({
        statusCode: 503,
        message: `No se puede abrir la vista financiera de ${activePlantel}: el agente de datos no está disponible.`,
        data: {
          diagnostic: {
            requestId,
            code: availability.code || 'IMPERSONATION_BRIDGE_AGENT_UNAVAILABLE',
            source: 'impersonation_bridge_preflight',
            status: availability.httpStatus || 503,
            plantel: activePlantel,
            agentId: activePlantel,
            retryable: true,
            message: availability.message,
            action: availability.action || 'Verifica el agente del plantel antes de volver a intentar.'
          }
        }
      })
    }
  }
  const targetName = String(target.displayName || target.username || target.email || email).trim()
  const impersonationOptions = impersonationCookieOptions()
  const authOptions = impersonatedAuthCookieOptions()
  const token = createImpersonationToken({
    impersonatorEmail: currentUser.email,
    impersonatorName: currentUser.name,
    activePlantel: currentUser.active_plantel,
    homePlantel: currentUser.auth_home_plantel
  })

  setCookie(event, 'auth_impersonation_token', token, { ...impersonationOptions, httpOnly: true })
  setCookie(event, 'auth_impersonating', 'true', impersonationOptions)
  setCookie(event, 'auth_impersonator_name', currentUser.name || currentUser.email, impersonationOptions)

  setCookie(event, 'auth_email', email, authOptions)
  setCookie(event, 'auth_name', targetName, authOptions)
  setCookie(event, 'auth_role', role, authOptions)
  setCookie(event, 'auth_planteles', planteles.join(','), authOptions)
  setCookie(event, 'auth_active_plantel', activePlantel, authOptions)
  setCookie(event, 'auth_home_plantel', activePlantel, authOptions)
  setCookie(event, 'auth_financial_planteles', financialPlanteles.join(','), authOptions)
  setCookie(event, 'auth_nav_mode', controlEscolarOnly ? 'control-escolar' : 'financial', authOptions)
  setCookie(event, 'auth_has_control_escolar', controlAccess ? 'true' : 'false', authOptions)
  setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', authOptions)
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })
  setCookie(event, 'db_bridge_agent_id', activePlantel, authOptions)
  setAuthSessionToken(event, {
    email,
    name: targetName,
    role,
    planteles: planteles.join(','),
    activePlantel,
    homePlantel: activePlantel
  }, 60 * 60 * 8)

  return {
    success: true,
    redirectTo: financialAccess ? '/' : '/control-escolar',
    user: {
      email,
      name: targetName,
      role,
      plantel: activePlantel,
      planteles
    }
  }
})
