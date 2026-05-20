import { OAuth2Client } from 'google-auth-library'
import { PLANTELES_LIST } from '../../../utils/constants'
import { isSuperAdminRole, normalizePlantel } from '../../utils/auth-session'

const SUPERADMIN_EMAILS = new Set([
  'desarrollo.tecnologico@casitaiedis.edu.mx',
  'coord.admon@casitaiedis.edu.mx'
])

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

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const requestedPlantel = getRequestedPlantel(event, body)

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

    const email = String(payload.email || '').trim()
    const emailKey = email.toLowerCase()
    const requestedRole = SUPERADMIN_EMAILS.has(emailKey) ? 'global' : 'plantel'
    const superAdmin = isSuperAdminRole(requestedRole)
    const allowedPlanteles = [...PLANTELES_LIST]
    const activePlantel = requestedPlantel || allowedPlanteles[0]
    const homePlantel = requestedPlantel || allowedPlanteles[0]
    const opts = cookieOptions()

    setCookie(event, 'auth_email', email, opts)
    setCookie(event, 'auth_name', payload.name || email, opts)
    setCookie(event, 'auth_role', requestedRole, opts)
    setCookie(event, 'auth_planteles', allowedPlanteles.join(','), opts)
    setCookie(event, 'auth_active_plantel', activePlantel, opts)
    setCookie(event, 'auth_home_plantel', homePlantel, opts)
    setCookie(event, 'auth_has_control_escolar', 'false', opts)
    setCookie(event, 'auth_has_financial_access', 'true', opts)
    setCookie(event, 'auth_is_super_admin', superAdmin ? 'true' : 'false', opts)
    deleteCookie(event, 'auth_nav_mode', { path: '/' })

    if (activePlantel && activePlantel !== 'GLOBAL') {
      setCookie(event, 'db_bridge_agent_id', activePlantel, opts)
    } else {
      setCookie(event, 'db_bridge_agent_id', homePlantel, opts)
    }

    return {
      success: true,
      activePlantel,
      redirectTo: '/'
    }
  } catch (error: any) {
    console.error('[Auth Login Error]', error)
    throw createError({
      statusCode: error?.statusCode || 401,
      message: error?.message || 'Error de autenticación con Google.'
    })
  }
})
