import { PLANTELES_LIST } from '../../../utils/constants'
import { authCookieOptions } from '../../utils/auth-cookie-options'
import {
  CONTROL_ESCOLAR_ROLE,
  hasControlEscolarRole,
  hasFinancialAccessForPlantel,
  isSuperAdminRole,
  normalizeAuthRole,
  normalizePlantel,
  parsePlanteles
} from '../../utils/auth-session'
import { findExternalAuthUserByEmail } from '../../utils/external-users'
import { clearImpersonationCookies } from '../../utils/impersonation-session'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

const SEEDED_SUPERADMIN_EMAILS = new Set([
  'desarrollo.tecnologico@casitaiedis.edu.mx',
  'coord.admon@casitaiedis.edu.mx'
])
const consumedNonces = new Map<string, number>()

const consumeNonce = (nonce: string, expiresAt: number) => {
  const now = Math.floor(Date.now() / 1000)
  for (const [key, expiry] of consumedNonces.entries()) {
    if (expiry < now) consumedNonces.delete(key)
  }
  if (consumedNonces.has(nonce)) {
    throw createError({ statusCode: 401, message: 'Este acceso a Sistema Rápido ya fue utilizado.' })
  }
  consumedNonces.set(nonce, expiresAt)
}

export default defineEventHandler(async (event) => {
  if (!isLocalSystemRuntime()) {
    throw createError({ statusCode: 404, message: 'Esta ruta solo está disponible en Sistema Rápido.' })
  }

  const query = getQuery(event)
  const ticket = String(query.ticket || '').trim()
  if (!ticket) throw createError({ statusCode: 401, message: 'El acceso a Sistema Rápido no es válido.' })
  const payload = await requestLocalSystemManager<{ email: string; plantel: string; nonce: string; exp: number }>(`/handoff/consume?ticket=${encodeURIComponent(ticket)}`)

  const config = useRuntimeConfig()
  const localPlantel = normalizePlantel(process.env.LOCAL_SYSTEM_PLANTEL || process.env.AGENT_ID || config.localSystemPlantel)
  if (!localPlantel || localPlantel !== normalizePlantel(payload.plantel)) {
    throw createError({ statusCode: 403, message: 'El acceso fue emitido para otro plantel.' })
  }

  const email = String(payload.email || '').trim().toLowerCase()
  const seededSuperAdmin = SEEDED_SUPERADMIN_EMAILS.has(email)
  const centralUser = seededSuperAdmin ? null : await findExternalAuthUserByEmail(email)

  if (!centralUser && !seededSuperAdmin) {
    throw createError({ statusCode: 403, message: 'La cuenta ya no tiene acceso al sistema.' })
  }
  if (!seededSuperAdmin && (centralUser?.ingresosBlocked || Number(centralUser?.ingresos_blocked || 0) === 1)) {
    throw createError({ statusCode: 403, message: 'La cuenta está bloqueada.' })
  }

  const role = seededSuperAdmin ? 'superadmin' : normalizeAuthRole(centralUser?.role || CONTROL_ESCOLAR_ROLE)
  const superAdmin = isSuperAdminRole(role)
  const assignedPlanteles = superAdmin ? [...PLANTELES_LIST] : parsePlanteles(centralUser?.plantel)
  if (!superAdmin && !assignedPlanteles.includes(localPlantel)) {
    throw createError({ statusCode: 403, message: 'La cuenta no tiene acceso a este plantel.' })
  }

  const controlAccess = superAdmin || hasControlEscolarRole(role)
  const financialAccess = hasFinancialAccessForPlantel(role, assignedPlanteles, localPlantel)
  const financialPlanteles = superAdmin
    ? [...PLANTELES_LIST]
    : assignedPlanteles.filter((plantel) => hasFinancialAccessForPlantel(role, assignedPlanteles, plantel))
  const name = String(centralUser?.displayName || centralUser?.username || email)
  const opts = authCookieOptions()

  consumeNonce(payload.nonce, payload.exp)
  clearImpersonationCookies(event)
  setCookie(event, 'auth_email', email, opts)
  setCookie(event, 'auth_name', name, opts)
  setCookie(event, 'auth_role', role, opts)
  setCookie(event, 'auth_planteles', assignedPlanteles.join(','), opts)
  setCookie(event, 'auth_active_plantel', localPlantel, opts)
  setCookie(event, 'auth_home_plantel', localPlantel, opts)
  setCookie(event, 'auth_financial_planteles', financialPlanteles.join(','), opts)
  setCookie(event, 'auth_nav_mode', financialAccess ? 'financial' : 'control-escolar', opts)
  setCookie(event, 'auth_has_control_escolar', controlAccess ? 'true' : 'false', opts)
  setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', opts)
  setCookie(event, 'db_bridge_agent_id', localPlantel, opts)
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })

  return sendRedirect(event, financialAccess ? '/' : '/control-escolar', 302)
})
