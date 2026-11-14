import bcrypt from 'bcryptjs'
import { query, getDbTransport } from '../../utils/db'
import { isLocalSystemRuntime } from '../../utils/local-system-manager'
import { normalizePlantel, normalizeAuthRole, isSuperAdminRole, hasFinancialAccessForPlantel, hasControlEscolarRole } from '../../utils/auth-session'
import { clearImpersonationCookies } from '../../utils/impersonation-session'
import { authCookieOptions } from '../../utils/auth-cookie-options'
import { setAuthSessionToken } from '../../utils/auth-session-token'

// This route reads only the campus MySQL users table. It never contacts
// Workspace, the relayer, or the central user directory.
const failures = new Map<string, { attempts: number; until: number }>()
const WINDOW_MS = 5 * 60 * 1000

export default defineEventHandler(async (event) => {
  if (!isLocalSystemRuntime() || getDbTransport() !== 'direct') {
    throw createError({ statusCode: 404, message: 'Acceso exclusivo de Aurora Local.' })
  }
  const config = useRuntimeConfig()
  const plantel = normalizePlantel(process.env.LOCAL_SYSTEM_PLANTEL || process.env.AGENT_ID || config.localSystemPlantel)
  if (!plantel || plantel === 'GLOBAL') throw createError({ statusCode: 503, message: 'Plantel local no configurado.' })

  const body = await readBody(event)
  const username = String(body?.username || '').trim()
  const password = String(body?.password || '')
  if (!username || username.length > 50 || !password || password.length > 256) {
    throw createError({ statusCode: 400, message: 'Ingresa tu usuario y contraseña locales.' })
  }
  const address = String(event.node.req.socket.remoteAddress || 'unknown')
  const key = address + ':' + username.toLowerCase()
  const now = Date.now()
  const attempt = failures.get(key)
  if (attempt?.until && attempt.until > now && attempt.attempts >= 8) {
    throw createError({ statusCode: 429, message: 'Demasiados intentos. Intenta nuevamente en unos minutos.' })
  }

  const rows = await query<any[]>('SELECT * FROM users WHERE username = ? LIMIT 1', [username])
  const account = rows[0]
  const hash = String(account?.password || '')
  // Never restore the legacy default-password provisioning or plaintext bypass.
  const valid = /^\$2[aby]\$\d{2}\$/.test(hash) && await bcrypt.compare(password, hash)
  const accountPlantel = normalizePlantel(account?.plantel)
  if (!valid || (accountPlantel && accountPlantel !== plantel)) {
    const next = attempt?.until && attempt.until > now ? attempt.attempts + 1 : 1
    if (failures.size > 512) {
      for (const [candidate, item] of failures) if (item.until < now) failures.delete(candidate)
    }
    failures.set(key, { attempts: next, until: now + WINDOW_MS })
    throw createError({ statusCode: 401, message: 'Credenciales locales inválidas.' })
  }
  failures.delete(key)

  // The legacy campus users table has no role column. Local users are scoped
  // to this installed campus and never receive global/superadmin privileges.
  const requestedRole = String(account.role || 'ROLE_ADMON,ROLE_CTRL')
  // A local credential must never elevate to cross-campus superadministration.
  const role = normalizeAuthRole(isSuperAdminRole(requestedRole) ? 'ROLE_CTRL' : requestedRole)
  const financial = hasFinancialAccessForPlantel(role, [plantel], plantel)
  const control = hasControlEscolarRole(role)
  const email = 'local-user-' + String(account.id) + '@aurora.local'
  const name = String(account.username || username)
  const opts = authCookieOptions()
  clearImpersonationCookies(event)
  setCookie(event, 'auth_email', email, opts)
  setCookie(event, 'auth_name', name, opts)
  setCookie(event, 'auth_role', role, opts)
  setCookie(event, 'auth_planteles', plantel, opts)
  setCookie(event, 'auth_active_plantel', plantel, opts)
  setCookie(event, 'auth_home_plantel', plantel, opts)
  setCookie(event, 'auth_financial_planteles', financial ? plantel : '', opts)
  setCookie(event, 'auth_nav_mode', financial ? 'financial' : 'control-escolar', opts)
  setCookie(event, 'auth_has_control_escolar', control ? 'true' : 'false', opts)
  setCookie(event, 'auth_has_financial_access', financial ? 'true' : 'false', opts)
  setCookie(event, 'db_bridge_agent_id', plantel, opts)
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })
  setAuthSessionToken(event, { email, name, role, planteles: plantel, activePlantel: plantel, homePlantel: plantel })
  console.info('[AuroraLocalAuth]', JSON.stringify({ event: 'signed-in', plantel, userId: account.id }))
  return { success: true, redirectTo: financial ? '/' : '/control-escolar' }
})
