import { OAuth2Client } from 'google-auth-library'
import {
  BRIDGE_AGENT_UNAVAILABLE_MESSAGE,
  isBridgeAgentUnavailableError,
  query,
  runWithBridgeAgentId
} from '../../utils/db'
import { PLANTELES_LIST } from '../../../utils/constants'
import {
  CONTROL_ESCOLAR_ROLE,
  hasControlEscolarRole,
  hasFinancialAccessForPlantel,
  isControlEscolarOnlyRole,
  isSuperAdminRole,
  normalizeAuthRole,
  normalizePlantel,
  parsePlanteles
} from '../../utils/auth-session'
import { findExternalAuthUserByEmail } from '../../utils/external-users'
import { isCasitaWorkspaceEmail } from '../../utils/google-workspace-directory'
import { logControlEscolarAuditEvent } from '../../utils/control-escolar-audit'
import { clearImpersonationCookies } from '../../utils/impersonation-session'
import { authCookieOptions } from '../../utils/auth-cookie-options'

const SUPERADMIN_EMAILS = new Set([
  'desarrollo.tecnologico@casitaiedis.edu.mx',
  'coord.admon@casitaiedis.edu.mx'
])

const ALL_PLANTELES = PLANTELES_LIST.join(',')

type DbUser = {
  id?: number
  username?: string | null
  email?: string | null
  role?: string | null
  planteles?: string | null
  avatar?: string | null
  plantel?: string | null
}

const getRequestedPlantel = (event: any, body: any) => {
  const fromBody = normalizePlantel(body?.plantel || body?.agentId)
  if (fromBody) return fromBody

  const fromHeader = normalizePlantel(getHeader(event, 'x-db-agent-id'))
  if (fromHeader) return fromHeader

  const fromBridgeCookie = normalizePlantel(getCookie(event, 'db_bridge_agent_id'))
  if (fromBridgeCookie) return fromBridgeCookie

  const fromAuthCookie = normalizePlantel(getCookie(event, 'auth_active_plantel'))
  if (fromAuthCookie && fromAuthCookie !== 'GLOBAL') return fromAuthCookie

  return ''
}

const resolveAllowedPlanteles = (user: DbUser, isSuperAdmin: boolean, requestedPlantel: string) => {
  if (isSuperAdmin) return [...PLANTELES_LIST]

  const assigned = parsePlanteles(user.planteles || user.plantel)
  if (assigned.length) return assigned

  const legacyPlantel = normalizePlantel(user.plantel)
  if (legacyPlantel && PLANTELES_LIST.includes(legacyPlantel)) return [legacyPlantel]

  if (requestedPlantel && PLANTELES_LIST.includes(requestedPlantel)) return [requestedPlantel]
  return []
}

/**
 * This is the financial-login path used by ebe34bf: regular financial users are
 * resolved against the active plantel database. The centralized users table is
 * only an optional role/plantel overlay and is not the runtime session store.
 */
const ensureLocalUser = async (payload: any, requestedPlantel: string): Promise<DbUser> => {
  const email = String(payload.email || '').trim()
  const emailKey = email.toLowerCase()
  const seedAdmin = SUPERADMIN_EMAILS.has(emailKey)

  let [user] = await query<DbUser[]>('SELECT * FROM users WHERE email = ? LIMIT 1', [email])

  if (!user) {
    const allUsers = await query<any[]>('SELECT id FROM users LIMIT 1')
    const firstUser = allUsers.length === 0
    const defaultRole = seedAdmin || firstUser ? 'superadmin' : 'plantel'
    const defaultPlanteles = seedAdmin || firstUser ? ALL_PLANTELES : requestedPlantel
    const defaultPlantel = requestedPlantel

    const result: any = await query(
      'INSERT INTO users (username, password, email, planteles, role, avatar, plantel) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        payload.name || email,
        'GOOGLE_AUTH',
        email,
        defaultPlanteles,
        defaultRole,
        payload.picture || null,
        defaultPlantel
      ]
    )

    user = {
      id: result.insertId,
      username: payload.name || email,
      email,
      role: defaultRole,
      planteles: defaultPlanteles,
      avatar: payload.picture || null,
      plantel: defaultPlantel
    }
  } else {
    if (seedAdmin && !isSuperAdminRole(user.role)) {
      user.role = 'superadmin'
      await query('UPDATE users SET role = ? WHERE id = ?', ['superadmin', user.id])
    }

    if (payload.picture && user.avatar !== payload.picture) {
      user.avatar = payload.picture
      await query('UPDATE users SET avatar = ? WHERE id = ?', [payload.picture, user.id])
    }
  }

  return user
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const requestedPlantel = getRequestedPlantel(event, body) || PLANTELES_LIST[0] || ''

  if (!requestedPlantel || !PLANTELES_LIST.includes(requestedPlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  }
  if (!config.public.googleClientId) {
    throw createError({ statusCode: 500, message: 'Configuración de Google ausente' })
  }
  if (!body?.credential) {
    throw createError({ statusCode: 400, message: 'Credencial ausente' })
  }

  const client = new OAuth2Client(config.public.googleClientId)

  try {
    const ticket = await client.verifyIdToken({
      idToken: body.credential,
      audience: config.public.googleClientId
    })
    const payload = ticket.getPayload()

    if (!payload?.email) throw new Error('Token inválido')

    const normalizedEmail = String(payload.email).trim().toLowerCase()
    if (!isCasitaWorkspaceEmail(normalizedEmail)) {
      throw createError({ statusCode: 403, message: 'No se pudo completar el acceso.' })
    }

    const seedAdmin = SUPERADMIN_EMAILS.has(normalizedEmail)

    // Read the central assignment once. Login remains available through the
    // plantel-local user path when that auxiliary source is unavailable, as it
    // was in ebe34bf. No lock, duplicate consolidation or login write runs here.
    const externalUser = seedAdmin
      ? null
      : await findExternalAuthUserByEmail(normalizedEmail).catch((error: any) => {
          console.warn('[Auth Login] Central role lookup skipped; using legacy plantel login', error?.message || error)
          return null
        })

    if (!seedAdmin && (externalUser?.ingresosBlocked || Number(externalUser?.ingresos_blocked || 0) === 1)) {
      throw createError({ statusCode: 403, message: 'Tu cuenta no tiene acceso al sistema.' })
    }

    const externalRole = normalizeAuthRole(externalUser?.role || 'plantel')
    const centralControlOnly = Boolean(externalUser) && isControlEscolarOnlyRole(externalRole)

    const resolvedUser: DbUser = seedAdmin
      ? {
          username: payload.name || normalizedEmail,
          email: normalizedEmail,
          role: 'superadmin',
          planteles: ALL_PLANTELES,
          plantel: requestedPlantel,
          avatar: payload.picture || null
        }
      : centralControlOnly
        ? {
            username: externalUser?.username || externalUser?.displayName || payload.name || normalizedEmail,
            email: externalUser?.email || normalizedEmail,
            role: externalRole || CONTROL_ESCOLAR_ROLE,
            planteles: externalUser?.planteles || externalUser?.plantel || requestedPlantel,
            plantel: parsePlanteles(externalUser?.planteles || externalUser?.plantel)[0] || requestedPlantel,
            avatar: payload.picture || null
          }
        : await runWithBridgeAgentId(requestedPlantel, async () => {
            const localUser = await ensureLocalUser(payload, requestedPlantel)
            if (!externalUser) return localUser

            const assignedPlanteles = externalUser.planteles || externalUser.plantel || localUser.planteles || localUser.plantel
            return {
              ...localUser,
              username: externalUser.username || externalUser.displayName || localUser.username,
              email: externalUser.email || localUser.email,
              role: externalRole,
              planteles: assignedPlanteles,
              plantel: parsePlanteles(assignedPlanteles)[0] || localUser.plantel || requestedPlantel,
              avatar: localUser.avatar || payload.picture || null
            }
          })

    const role = normalizeAuthRole(resolvedUser.role || 'plantel')
    const superAdmin = isSuperAdminRole(role)
    const controlEscolar = superAdmin || hasControlEscolarRole(role)
    const allowedPlanteles = resolveAllowedPlanteles(resolvedUser, superAdmin, requestedPlantel)

    if (!superAdmin && !allowedPlanteles.length) {
      throw createError({ statusCode: 403, message: 'Tu cuenta no tiene un plantel asignado.' })
    }

    const fallbackPlantel = allowedPlanteles[0] || requestedPlantel
    const activePlantel = superAdmin
      ? requestedPlantel
      : (allowedPlanteles.includes(requestedPlantel) ? requestedPlantel : fallbackPlantel)
    const homePlantel = activePlantel
    const financialPlanteles = allowedPlanteles.filter((plantel) => hasFinancialAccessForPlantel(role, allowedPlanteles, plantel))
    const financialAccess = hasFinancialAccessForPlantel(role, allowedPlanteles, activePlantel)
    const controlEscolarOnly = controlEscolar && !financialAccess
    const opts = authCookieOptions()

    clearImpersonationCookies(event)

    setCookie(event, 'auth_email', resolvedUser.email || normalizedEmail, opts)
    setCookie(event, 'auth_name', resolvedUser.username || payload.name || normalizedEmail, opts)
    setCookie(event, 'auth_role', role, opts)
    setCookie(event, 'auth_planteles', superAdmin ? ALL_PLANTELES : allowedPlanteles.join(','), opts)
    setCookie(event, 'auth_active_plantel', activePlantel, opts)
    setCookie(event, 'auth_home_plantel', homePlantel, opts)
    setCookie(event, 'auth_financial_planteles', financialPlanteles.join(','), opts)
    setCookie(event, 'auth_nav_mode', controlEscolarOnly ? 'control-escolar' : 'financial', opts)
    setCookie(event, 'auth_has_control_escolar', controlEscolar ? 'true' : 'false', opts)
    setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', opts)
    deleteCookie(event, 'auth_is_super_admin', { path: '/' })
    setCookie(event, 'db_bridge_agent_id', homePlantel, opts)

    if (controlEscolar || superAdmin) {
      logControlEscolarAuditEvent({
        eventType: 'control_login',
        plantel: normalizePlantel(activePlantel),
        user: {
          email: resolvedUser.email || normalizedEmail,
          name: resolvedUser.username || payload.name || normalizedEmail,
          role
        },
        summary: `${resolvedUser.username || payload.name || normalizedEmail} inició sesión con acceso a Control Escolar`,
        payload: { activePlantel, homePlantel, controlEscolarOnly, superAdmin }
      }).catch((error: any) => {
        console.warn('[Control Escolar Audit] Login audit skipped', error?.message || error)
      })
    }

    return {
      success: true,
      activePlantel,
      redirectTo: controlEscolarOnly ? '/control-escolar' : '/'
    }
  } catch (error: any) {
    console.error('[Auth Login Error]', error)
    const agentUnavailable = isBridgeAgentUnavailableError(error)

    throw createError({
      statusCode: agentUnavailable ? 503 : (error?.statusCode || 401),
      message: agentUnavailable ? BRIDGE_AGENT_UNAVAILABLE_MESSAGE : (error?.message || 'Error de autenticación con Google.')
    })
  }
})
