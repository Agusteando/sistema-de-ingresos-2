import { getTrustedAuthUser } from '../../utils/auth-session'
import { clearAuthSessionToken } from '../../utils/auth-session-token'

const PUBLIC_AUTH_COOKIES = [
  'auth_email',
  'auth_name',
  'auth_role',
  'auth_planteles',
  'auth_active_plantel',
  'auth_home_plantel',
  'auth_financial_planteles',
  'auth_nav_mode',
  'auth_has_control_escolar',
  'auth_has_financial_access',
  'auth_is_super_admin',
  'db_bridge_agent_id'
]

const clearPublicAuthCookies = (event: any) => {
  clearAuthSessionToken(event)
  for (const cookieName of PUBLIC_AUTH_COOKIES) deleteCookie(event, cookieName, { path: '/' })
}

export default defineEventHandler(async (event) => {
  try {
    const user = await getTrustedAuthUser(event)
    return {
      ok: true,
      email: user.email,
      name: user.name,
      role: user.role,
      roles: user.roles,
      activePlantel: user.active_plantel,
      homePlantel: user.auth_home_plantel,
      planteles: user.plantelesList,
      financialPlanteles: user.financialPlantelesList,
      isSuperAdmin: user.isSuperAdmin,
      hasFinancialAccess: user.hasFinancialAccess,
      hasControlEscolarRole: user.hasControlEscolarRole,
      isControlEscolarOnly: user.isControlEscolarOnly
    }
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 401) || 401
    const code = status === 503 ? 'AUTH_SESSION_CONFIG_INVALID' : 'AUTH_SESSION_INVALID'
    const message = String(error?.message || 'La sesión no es válida. Inicia sesión nuevamente.').replace(/\s+/g, ' ').trim()

    if (status === 401 || status === 403) clearPublicAuthCookies(event)

    throw createError({
      statusCode: status,
      statusMessage: 'Auth session invalid',
      message,
      data: {
        diagnostic: {
          requestId: String(event.context?.auroraRequestId || ''),
          code,
          source: 'auth_session',
          status,
          retryable: false,
          message
        }
      }
    })
  }
})
