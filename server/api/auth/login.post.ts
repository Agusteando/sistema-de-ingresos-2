import { OAuth2Client } from 'google-auth-library'
import { PLANTELES_LIST } from '../../../utils/constants'
import { CONTROL_ESCOLAR_ROLE, hasFinancialAccessForPlantel, isSuperAdminRole, normalizePlantel, parsePlanteles } from '../../utils/auth-session'
import { touchExternalUserLogin } from '../../utils/external-users'
import { isCasitaWorkspaceEmail } from '../../utils/google-workspace-directory'
import { logControlEscolarAuditEvent } from '../../utils/control-escolar-audit'

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

const resolveAllowedPlanteles = (user: DbUser, isSuperAdmin: boolean) => {
  if (isSuperAdmin) return [...PLANTELES_LIST]
  return parsePlanteles(user.plantel).filter((plantel) => PLANTELES_LIST.includes(plantel))
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

    const normalizedEmail = String(payload.email).trim().toLowerCase()
    if (!isCasitaWorkspaceEmail(normalizedEmail)) {
      throw createError({ statusCode: 403, message: 'No se pudo completar el acceso.' })
    }

    const seedAdmin = SUPERADMIN_EMAILS.has(normalizedEmail)
    const externalUser = await touchExternalUserLogin({
      email: normalizedEmail,
      name: payload.name,
      picture: payload.picture,
      requestedPlantel
    })

    if (!seedAdmin && externalUser?.ingresosBlocked) {
      throw createError({ statusCode: 403, message: 'Tu cuenta no tiene acceso al sistema.' })
    }

    const centralAuthUser: DbUser = seedAdmin
      ? {
          username: payload.name || normalizedEmail,
          email: normalizedEmail,
          role: 'superadmin',
          plantel: ALL_PLANTELES,
          avatar: payload.picture || null
        }
      : {
          username: externalUser?.username || externalUser?.displayName || payload.name || normalizedEmail,
          email: externalUser?.email || normalizedEmail,
          role: externalUser?.role || CONTROL_ESCOLAR_ROLE,
          plantel: externalUser?.plantel || '',
          avatar: externalUser?.avatar || externalUser?.picture || payload.picture || null
        }

    const resolvedUser = centralAuthUser
    const role = String(resolvedUser.role || CONTROL_ESCOLAR_ROLE).trim() || CONTROL_ESCOLAR_ROLE
    const superAdmin = isSuperAdminRole(role)
    const controlEscolar = true
    const allowedPlanteles = resolveAllowedPlanteles(resolvedUser, superAdmin)
    if (!superAdmin && !allowedPlanteles.length) {
      throw createError({ statusCode: 403, message: 'Tu cuenta no tiene un plantel asignado.' })
    }
    const requestedAllowed = allowedPlanteles.includes(requestedPlantel)
    const activePlantel = superAdmin
      ? (requestedPlantel || allowedPlanteles[0])
      : (requestedAllowed ? requestedPlantel : allowedPlanteles[0])
    const homePlantel = activePlantel && activePlantel !== 'GLOBAL' ? activePlantel : allowedPlanteles[0]
    const financialPlanteles = allowedPlanteles.filter((plantel) => hasFinancialAccessForPlantel(role, allowedPlanteles, plantel))
    const financialAccess = hasFinancialAccessForPlantel(role, allowedPlanteles, activePlantel)
    const controlEscolarOnly = !superAdmin && !financialAccess
    const opts = cookieOptions()

    setCookie(event, 'auth_email', resolvedUser.email || payload.email, opts)
    setCookie(event, 'auth_name', resolvedUser.username || payload.name || payload.email, opts)
    setCookie(event, 'auth_role', role, opts)
    setCookie(event, 'auth_planteles', superAdmin ? ALL_PLANTELES : allowedPlanteles.join(','), opts)
    setCookie(event, 'auth_active_plantel', activePlantel, opts)
    setCookie(event, 'auth_home_plantel', homePlantel, opts)
    setCookie(event, 'auth_financial_planteles', financialPlanteles.join(','), opts)
    setCookie(event, 'auth_nav_mode', controlEscolarOnly ? 'control-escolar' : 'financial', opts)
    setCookie(event, 'auth_has_control_escolar', 'true', opts)
    setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', opts)
    deleteCookie(event, 'auth_is_super_admin', { path: '/' })
    setCookie(event, 'db_bridge_agent_id', homePlantel || PLANTELES_LIST[0], opts)

    if (controlEscolar || superAdmin) {
      const auditPlantel = normalizePlantel(activePlantel && activePlantel !== 'GLOBAL' ? activePlantel : homePlantel || PLANTELES_LIST[0])
      logControlEscolarAuditEvent({
        eventType: 'control_login',
        plantel: auditPlantel,
        user: {
          email: resolvedUser.email || payload.email,
          name: resolvedUser.username || payload.name || payload.email,
          role,
        },
        summary: `${resolvedUser.username || payload.name || payload.email} inició sesión con acceso a Control Escolar`,
        payload: {
          activePlantel,
          homePlantel,
          controlEscolarOnly,
          superAdmin,
        },
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
    const statusCode = Number(error?.statusCode || (error?.code ? 503 : 401))
    const message = statusCode >= 500
      ? 'No se pudo validar el acceso en este momento.'
      : (error?.message || 'Error de autenticación con Google.')

    throw createError({ statusCode, message })
  }
})
