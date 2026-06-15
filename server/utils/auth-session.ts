import { PLANTELES_LIST } from '../../utils/constants'

export type AuthRole = 'plantel' | 'superadmin' | string

export type AuthSessionUser = {
  email: string
  name: string
  role: AuthRole
  roles: string[]
  planteles: string
  plantelesList: string[]
  financialPlanteles: string
  financialPlantelesList: string[]
  active_plantel: string
  auth_home_plantel: string
  isSuperAdmin: boolean
  hasControlEscolarRole: boolean
  isControlEscolarOnly: boolean
  hasFinancialAccess: boolean
}

const SUPERADMIN_ROLES = new Set(['superadmin'])
const SEEDED_SUPERADMIN_EMAILS = new Set([
  'desarrollo.tecnologico@casitaiedis.edu.mx',
  'coord.admon@casitaiedis.edu.mx'
])
export const CONTROL_ESCOLAR_ROLE = 'ROLE_CTRL'
export const FINANCIAL_ADMIN_ROLE = 'ROLE_ADMON'
const VALID_PLANTELES = new Set(PLANTELES_LIST)

export const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase()

export const parseRoles = (value: unknown) => String(value || '')
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean)

const normalizeRole = (role: unknown) => String(role || '').trim().toLowerCase()

export const hasRole = (roleValue: unknown, roleName: string) => {
  const target = normalizeRole(roleName)
  return parseRoles(roleValue).some((role) => normalizeRole(role) === target)
}

export const isSuperAdminRole = (role: unknown) => parseRoles(role).some((entry) => SUPERADMIN_ROLES.has(normalizeRole(entry)))

export const hasControlEscolarRole = (role: unknown) => hasRole(role, CONTROL_ESCOLAR_ROLE)

/**
 * Financial access is explicit: only ROLE_ADMON grants the Financial domain.
 * Unknown, empty, or legacy roles remain in the safe Control Escolar domain.
 */
export const hasFinancialAdminRole = (role: unknown) => hasRole(role, FINANCIAL_ADMIN_ROLE)

export const normalizeAuthRole = (role: unknown) => {
  if (isSuperAdminRole(role)) return 'superadmin'
  const roles: string[] = []
  if (hasControlEscolarRole(role)) roles.push(CONTROL_ESCOLAR_ROLE)
  if (hasFinancialAdminRole(role)) roles.push(FINANCIAL_ADMIN_ROLE)
  return roles.length ? roles.join(',') : CONTROL_ESCOLAR_ROLE
}

export const isControlEscolarOnlyRole = (role: unknown) => hasControlEscolarRole(normalizeAuthRole(role)) && !hasFinancialAdminRole(role)

export const parsePlanteles = (value: unknown) => Array.from(new Set(String(value || '')
  .split(',')
  .map(normalizePlantel)
  .filter((plantel) => VALID_PLANTELES.has(plantel))))

export const getSuperAdminPlanteles = () => [...PLANTELES_LIST]

export const isValidPlantelScope = (plantel: string) => plantel === 'GLOBAL' || VALID_PLANTELES.has(plantel)

export const hasFinancialAccessForPlantel = (
  role: unknown,
  assignedPlanteles: unknown,
  plantelValue: unknown,
) => {
  if (isSuperAdminRole(role)) return true
  const plantel = normalizePlantel(plantelValue)
  if (!plantel || plantel === 'GLOBAL' || !VALID_PLANTELES.has(plantel)) return false
  if (!hasFinancialAdminRole(role)) return false
  return parsePlanteles(assignedPlanteles).includes(plantel)
}

const getCookiePlantel = (event: any, name: string) => normalizePlantel(getCookie(event, name))

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

export const getTrustedAuthUser = async (event: any): Promise<AuthSessionUser> => {
  if (event?.context?.trustedAuthUser) return event.context.trustedAuthUser as AuthSessionUser

  const email = String(getCookie(event, 'auth_email') || '').trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const { findExternalUserByEmail } = await import('./external-users')
  const centralUser = await findExternalUserByEmail(email)
  const seededSuperAdmin = SEEDED_SUPERADMIN_EMAILS.has(email)

  if (!centralUser && !seededSuperAdmin) {
    throw createError({ statusCode: 403, message: 'La cuenta ya no tiene acceso al sistema.' })
  }

  if (!seededSuperAdmin && (centralUser?.ingresosBlocked || Number(centralUser?.ingresos_blocked || 0) === 1)) {
    throw createError({ statusCode: 403, message: 'La cuenta está bloqueada.' })
  }

  const role = seededSuperAdmin
    ? 'superadmin'
    : normalizeAuthRole(centralUser?.role)
  const roles = parseRoles(role)
  const superAdmin = isSuperAdminRole(role)
  const assignedPlanteles = parsePlanteles(centralUser?.plantel)

  if (!superAdmin && !assignedPlanteles.length) {
    throw createError({ statusCode: 403, message: 'La cuenta no tiene un plantel asignado.' })
  }

  const allowedPlanteles = superAdmin ? [...PLANTELES_LIST] : assignedPlanteles
  const fallbackPlantel = allowedPlanteles[0] || PLANTELES_LIST[0] || ''
  if (!fallbackPlantel) {
    throw createError({ statusCode: 500, message: 'No hay planteles configurados.' })
  }
  const allowedSet = new Set(allowedPlanteles)
  const cookieActive = getCookiePlantel(event, 'auth_active_plantel')
  const activePlantel: string = cookieActive === 'GLOBAL' && superAdmin
    ? 'GLOBAL'
    : cookieActive && allowedSet.has(cookieActive)
      ? cookieActive
      : fallbackPlantel
  const cookieHome = getCookiePlantel(event, 'auth_home_plantel')
  const homePlantel: string = cookieHome && allowedSet.has(cookieHome)
    ? cookieHome
    : (activePlantel !== 'GLOBAL' ? activePlantel : fallbackPlantel)
  const controlAccess = superAdmin || hasControlEscolarRole(role)
  const financialPlanteles = superAdmin || hasFinancialAdminRole(role) ? [...allowedPlanteles] : []
  const financialAccess = hasFinancialAccessForPlantel(role, allowedPlanteles, activePlantel)
  const controlEscolarOnly = controlAccess && !financialAccess

  if (activePlantel && !isValidPlantelScope(activePlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel activo inválido.' })
  }

  if (activePlantel === 'GLOBAL' && !superAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para vista consolidada.' })
  }

  const cookieOptions = {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400 * 7,
    sameSite: 'lax' as const
  }
  const name = firstText(centralUser?.displayName, centralUser?.username, getCookie(event, 'auth_name'), email)
  setCookie(event, 'auth_name', name, cookieOptions)
  setCookie(event, 'auth_role', role, cookieOptions)
  setCookie(event, 'auth_planteles', allowedPlanteles.join(','), cookieOptions)
  setCookie(event, 'auth_active_plantel', activePlantel, cookieOptions)
  setCookie(event, 'auth_home_plantel', homePlantel, cookieOptions)
  setCookie(event, 'auth_financial_planteles', financialPlanteles.join(','), cookieOptions)
  setCookie(event, 'auth_nav_mode', controlEscolarOnly ? 'control-escolar' : 'financial', cookieOptions)
  setCookie(event, 'auth_has_control_escolar', controlAccess ? 'true' : 'false', cookieOptions)
  setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', cookieOptions)
  setCookie(event, 'db_bridge_agent_id', activePlantel !== 'GLOBAL' ? activePlantel : homePlantel, cookieOptions)

  const user: AuthSessionUser = {
    email,
    name,
    role,
    roles,
    planteles: allowedPlanteles.join(','),
    plantelesList: allowedPlanteles,
    financialPlanteles: financialPlanteles.join(','),
    financialPlantelesList: financialPlanteles,
    active_plantel: activePlantel,
    auth_home_plantel: homePlantel,
    isSuperAdmin: superAdmin,
    hasControlEscolarRole: controlAccess,
    isControlEscolarOnly: controlEscolarOnly,
    hasFinancialAccess: financialAccess
  }

  if (event?.context) event.context.trustedAuthUser = user
  return user
}

export const resolveDataBridgeAgentId = (event: any, user: AuthSessionUser) => {
  if (user.active_plantel && user.active_plantel !== 'GLOBAL') return user.active_plantel

  const bridgeAgent = getCookiePlantel(event, 'db_bridge_agent_id')
  if (bridgeAgent && VALID_PLANTELES.has(bridgeAgent) && user.plantelesList.includes(bridgeAgent)) return bridgeAgent

  return user.auth_home_plantel || PLANTELES_LIST[0]
}
