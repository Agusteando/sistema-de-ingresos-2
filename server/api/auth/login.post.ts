import { OAuth2Client } from 'google-auth-library'
import { query, runWithBridgeAgentId } from '../../utils/db'
import { PLANTELES_LIST } from '../../../utils/constants'
import { hasControlEscolarRole, isControlEscolarOnlyRole, isSuperAdminRole, normalizePlantel, parsePlanteles } from '../../utils/auth-session'
import { findExternalUserByEmail, isExternalUsersAvailable } from '../../utils/external-users'

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

const cookieOptions = () => ({
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 86400 * 7,
  sameSite: 'lax' as const
})

const resolveAllowedPlanteles = (user: DbUser, isSuperAdmin: boolean, requestedPlantel: string) => {
  if (isSuperAdmin) return [...PLANTELES_LIST]

  const fromPlanteles = parsePlanteles(user.planteles).filter((plantel) => PLANTELES_LIST.includes(plantel))
  if (fromPlanteles.length) return fromPlanteles

  const legacyPlantel = normalizePlantel(user.plantel)
  if (legacyPlantel && PLANTELES_LIST.includes(legacyPlantel)) return [legacyPlantel]

  if (requestedPlantel && PLANTELES_LIST.includes(requestedPlantel)) return [requestedPlantel]

  return [PLANTELES_LIST[0]]
}

const ensureLocalUser = async (payload: any, requestedPlantel: string): Promise<DbUser> => {
  const email = String(payload.email || '').trim()
  const emailKey = email.toLowerCase()
  const seedAdmin = SUPERADMIN_EMAILS.has(emailKey)

  let [user] = await query<DbUser[]>('SELECT * FROM users WHERE email = ? LIMIT 1', [email])

  if (!user) {
    const allUsers = await query<any[]>('SELECT id FROM users LIMIT 1')
    const firstUser = allUsers.length === 0
    const defaultRole = seedAdmin || firstUser ? 'global' : 'plantel'
    const defaultPlanteles = seedAdmin || firstUser ? ALL_PLANTELES : (requestedPlantel || PLANTELES_LIST[0])
    const defaultPlantel = requestedPlantel || PLANTELES_LIST[0]

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
      user.role = 'global'
      await query('UPDATE users SET role = ? WHERE id = ?', ['global', user.id])
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
  const requestedPlantel = getRequestedPlantel(event, body) || PLANTELES_LIST[0]

  if (requestedPlantel && !PLANTELES_LIST.includes(requestedPlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  }

  if (!config.public.googleClientId) {
    throw createError({ statusCode: 500, message: 'Configuración de Google ausente' })
  }

  if (!body || !body.credential) {
    throw createError({ statusCode: 400, message: 'Credencial ausente' })
  }

  const client = new OAuth2Client(config.public.googleClientId)

  try {
    const ticket = await client.verifyIdToken({
      idToken: body.credential,
      audience: config.public.googleClientId
    })

    const payload = ticket.getPayload()

    if (!payload || !payload.email) {
      throw new Error('Token inválido')
    }

    const localUser = await runWithBridgeAgentId(requestedPlantel, async () => ensureLocalUser(payload, requestedPlantel))
    const externalUsersAvailable = await isExternalUsersAvailable().catch((error: any) => {
      console.warn('[Auth Login] External users table unavailable; using local auth defaults', error?.message || error)
      return false
    })
    const externalUser = externalUsersAvailable
      ? await findExternalUserByEmail(payload.email).catch((error: any) => {
          console.warn('[Auth Login] External users lookup skipped', error?.message || error)
          return null
        })
      : null
    const user = externalUsersAvailable && !isSuperAdminRole(localUser.role)
      ? {
          ...localUser,
          username: externalUser?.username || localUser.username,
          email: externalUser?.email || localUser.email,
          role: externalUser?.role || 'plantel',
          planteles: externalUser?.planteles || localUser.planteles,
          plantel: externalUser?.plantel || localUser.plantel,
          avatar: externalUser?.avatar || localUser.avatar
        }
      : localUser
    const role = String(user.role || 'plantel').trim() || 'plantel'
    const superAdmin = isSuperAdminRole(role)
    const controlEscolar = hasControlEscolarRole(role)
    const controlEscolarOnly = !superAdmin && isControlEscolarOnlyRole(role)
    const allowedPlanteles = resolveAllowedPlanteles(user, superAdmin, requestedPlantel)
    const requestedAllowed = allowedPlanteles.includes(requestedPlantel)
    const activePlantel = superAdmin
      ? (requestedPlantel || allowedPlanteles[0])
      : (requestedAllowed ? requestedPlantel : allowedPlanteles[0])
    const homePlantel = activePlantel && activePlantel !== 'GLOBAL' ? activePlantel : allowedPlanteles[0]
    const opts = cookieOptions()

    setCookie(event, 'auth_email', user.email || payload.email, opts)
    setCookie(event, 'auth_name', user.username || payload.name || payload.email, opts)
    setCookie(event, 'auth_role', role, opts)
    setCookie(event, 'auth_planteles', superAdmin ? ALL_PLANTELES : allowedPlanteles.join(','), opts)
    setCookie(event, 'auth_active_plantel', activePlantel, opts)
    setCookie(event, 'auth_home_plantel', homePlantel, opts)
    setCookie(event, 'auth_nav_mode', controlEscolarOnly ? 'control-escolar' : 'financial', opts)
    setCookie(event, 'auth_has_control_escolar', controlEscolar || superAdmin ? 'true' : 'false', opts)
    setCookie(event, 'auth_has_financial_access', superAdmin || !controlEscolarOnly ? 'true' : 'false', opts)
    setCookie(event, 'auth_is_super_admin', superAdmin ? 'true' : 'false', opts)
    setCookie(event, 'db_bridge_agent_id', homePlantel || PLANTELES_LIST[0], opts)

    return {
      success: true,
      activePlantel,
      redirectTo: controlEscolarOnly ? '/control-escolar' : '/'
    }
  } catch (error: any) {
    console.error('[Auth Login Error]', error)
    throw createError({
      statusCode: error?.statusCode || 401,
      message: error?.message || 'Error de autenticación con Google.'
    })
  }
})
