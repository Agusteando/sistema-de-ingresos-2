import { PLANTELES_LIST } from '../../../../utils/constants'
import { isSuperAdminRole, normalizeAuthRole, normalizePlantel } from '../../../utils/auth-session'
import { findExternalAuthUserByEmail } from '../../../utils/external-users'
import {
  clearImpersonationCookies,
  impersonationCookieOptions,
  verifyImpersonationToken
} from '../../../utils/impersonation-session'
import { setAuthSessionToken } from '../../../utils/auth-session-token'

const SEEDED_SUPERADMIN_EMAILS = new Set([
  'desarrollo.tecnologico@casitaiedis.edu.mx',
  'coord.admon@casitaiedis.edu.mx'
])

export default defineEventHandler(async (event) => {
  let token
  try {
    token = verifyImpersonationToken(getCookie(event, 'auth_impersonation_token'), { allowExpired: true })
  } catch (error: any) {
    if (Number(error?.statusCode || 0) === 401) clearImpersonationCookies(event)
    throw error
  }
  const email = String(token.impersonatorEmail || '').trim().toLowerCase()
  const seeded = SEEDED_SUPERADMIN_EMAILS.has(email)
  const original = seeded ? null : await findExternalAuthUserByEmail(email)
  const role = seeded ? 'superadmin' : normalizeAuthRole(original?.role)

  if (!seeded && (!original || !isSuperAdminRole(role) || original.ingresosBlocked || Number(original.ingresos_blocked || 0) === 1)) {
    clearImpersonationCookies(event)
    throw createError({ statusCode: 403, message: 'La cuenta original ya no tiene permisos de superadministrador.' })
  }

  const preferredPlantel = normalizePlantel(token.activePlantel)
  const homePlantel = normalizePlantel(token.homePlantel)
  const activePlantel = preferredPlantel === 'GLOBAL' || PLANTELES_LIST.includes(preferredPlantel)
    ? preferredPlantel
    : (PLANTELES_LIST.includes(homePlantel) ? homePlantel : PLANTELES_LIST[0])
  const resolvedHomePlantel = activePlantel !== 'GLOBAL'
    ? activePlantel
    : (PLANTELES_LIST.includes(homePlantel) ? homePlantel : PLANTELES_LIST[0])
  const name = String(original?.displayName || original?.username || token.impersonatorName || email).trim()
  const options = { ...impersonationCookieOptions(), maxAge: 86400 * 7 }

  setCookie(event, 'auth_email', email, options)
  setCookie(event, 'auth_name', name, options)
  setCookie(event, 'auth_role', 'superadmin', options)
  setCookie(event, 'auth_planteles', PLANTELES_LIST.join(','), options)
  setCookie(event, 'auth_active_plantel', activePlantel, options)
  setCookie(event, 'auth_home_plantel', resolvedHomePlantel, options)
  setCookie(event, 'auth_financial_planteles', PLANTELES_LIST.join(','), options)
  setCookie(event, 'auth_nav_mode', 'financial', options)
  setCookie(event, 'auth_has_control_escolar', 'true', options)
  setCookie(event, 'auth_has_financial_access', 'true', options)
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })
  setCookie(event, 'db_bridge_agent_id', resolvedHomePlantel, options)
  setAuthSessionToken(event, {
    email,
    name,
    role: 'superadmin',
    planteles: PLANTELES_LIST.join(','),
    activePlantel,
    homePlantel: resolvedHomePlantel
  })
  clearImpersonationCookies(event)

  return { success: true, redirectTo: '/usuarios' }
})
