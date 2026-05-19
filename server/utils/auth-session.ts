import { query, runWithBridgeAgentId } from './db'
import { PLANTELES_LIST } from '../../utils/constants'

export type AuthRole = 'plantel' | 'global' | 'superadmin' | string

export type AuthSessionUser = {
  email: string
  name: string
  role: AuthRole
  planteles: string
  plantelesList: string[]
  active_plantel: string
  auth_home_plantel: string
  isSuperAdmin: boolean
}

type DbUser = {
  username?: string | null
  email?: string | null
  role?: string | null
  planteles?: string | null
  plantel?: string | null
}

const SUPERADMIN_ROLES = new Set(['global', 'superadmin'])
const VALID_PLANTELES = new Set(PLANTELES_LIST)

export const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase()

export const isSuperAdminRole = (role: unknown) => SUPERADMIN_ROLES.has(String(role || '').trim().toLowerCase())

export const parsePlanteles = (value: unknown) => String(value || '')
  .split(',')
  .map(normalizePlantel)
  .filter(Boolean)

export const getSuperAdminPlanteles = () => [...PLANTELES_LIST]

export const isValidPlantelScope = (plantel: string) => plantel === 'GLOBAL' || VALID_PLANTELES.has(plantel)

const getCookiePlantel = (event: any, name: string) => normalizePlantel(getCookie(event, name))

export const resolveAuthHomePlantel = (event: any) => {
  const explicitHome = getCookiePlantel(event, 'auth_home_plantel')
  if (explicitHome && VALID_PLANTELES.has(explicitHome)) return explicitHome

  const bridgeAgent = getCookiePlantel(event, 'db_bridge_agent_id')
  if (bridgeAgent && VALID_PLANTELES.has(bridgeAgent)) return bridgeAgent

  const activePlantel = getCookiePlantel(event, 'auth_active_plantel')
  if (activePlantel && VALID_PLANTELES.has(activePlantel)) return activePlantel

  return ''
}

export const getTrustedAuthUser = async (event: any): Promise<AuthSessionUser> => {
  const email = String(getCookie(event, 'auth_email') || '').trim()

  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const homePlantel = resolveAuthHomePlantel(event)

  if (!homePlantel) {
    throw createError({ statusCode: 401, message: 'Sesión sin plantel de autenticación.' })
  }

  const [dbUser] = await runWithBridgeAgentId(homePlantel, async () => {
    return await query<DbUser[]>(
      'SELECT username, email, role, planteles, plantel FROM users WHERE email = ? LIMIT 1',
      [email]
    )
  })

  if (!dbUser) {
    throw createError({ statusCode: 401, message: 'Sesión no válida para el plantel de autenticación.' })
  }

  const role = String(dbUser.role || 'plantel')
  const isSuperAdmin = isSuperAdminRole(role)
  const dbPlanteles = parsePlanteles(dbUser.planteles)
  const legacyPlantel = normalizePlantel(dbUser.plantel)
  const allowedPlanteles = isSuperAdmin
    ? getSuperAdminPlanteles()
    : (dbPlanteles.length > 0 ? dbPlanteles : (legacyPlantel ? [legacyPlantel] : []))

  const activePlantel = getCookiePlantel(event, 'auth_active_plantel') || allowedPlanteles[0] || homePlantel

  if (!isValidPlantelScope(activePlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel activo inválido.' })
  }

  if (activePlantel === 'GLOBAL' && !isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para vista consolidada.' })
  }

  if (activePlantel !== 'GLOBAL' && !isSuperAdmin && !allowedPlanteles.includes(activePlantel)) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este plantel.' })
  }

  return {
    email,
    name: String(dbUser.username || getCookie(event, 'auth_name') || email),
    role,
    planteles: allowedPlanteles.join(','),
    plantelesList: allowedPlanteles,
    active_plantel: activePlantel,
    auth_home_plantel: homePlantel,
    isSuperAdmin
  }
}

export const resolveDataBridgeAgentId = (event: any, user: AuthSessionUser) => {
  if (user.active_plantel && user.active_plantel !== 'GLOBAL') return user.active_plantel

  const bridgeAgent = getCookiePlantel(event, 'db_bridge_agent_id')
  if (bridgeAgent && VALID_PLANTELES.has(bridgeAgent)) return bridgeAgent

  return user.auth_home_plantel
}
