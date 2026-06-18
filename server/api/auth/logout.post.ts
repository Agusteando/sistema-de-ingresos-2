import { clearAuthSessionToken } from '../../utils/auth-session-token'

export default defineEventHandler((event) => {
  clearAuthSessionToken(event)
  deleteCookie(event, 'auth_email', { path: '/' })
  deleteCookie(event, 'auth_name', { path: '/' })
  deleteCookie(event, 'auth_role', { path: '/' })
  deleteCookie(event, 'auth_planteles', { path: '/' })
  deleteCookie(event, 'auth_active_plantel', { path: '/' })
  deleteCookie(event, 'auth_home_plantel', { path: '/' })
  deleteCookie(event, 'auth_financial_planteles', { path: '/' })
  deleteCookie(event, 'auth_nav_mode', { path: '/' })
  deleteCookie(event, 'auth_has_control_escolar', { path: '/' })
  deleteCookie(event, 'auth_has_financial_access', { path: '/' })
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })
  deleteCookie(event, 'db_bridge_agent_id', { path: '/' })
  deleteCookie(event, 'auth_impersonator_name', { path: '/' })
  deleteCookie(event, 'auth_impersonating', { path: '/' })
  deleteCookie(event, 'auth_impersonation_token', { path: '/' })

  return { success: true }
})
