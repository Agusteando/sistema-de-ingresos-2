import { PLANTELES_LIST } from '../../utils/constants'

export type AuthRole = 'plantel' | 'global' | 'superadmin' | string

export type AuthSessionUser = {
  email: string
  name: string
  role: AuthRole
  roles: string[]
  planteles: string
  plantelesList: string[]
  active_plantel: string
  auth_home_plantel: string
  isSuperAdmin: boolean
  hasControlEscolarRole: boolean
  isControlEscolarOnly: boolean
  hasFinancialAccess: boolean
}

const SUPERADMIN_ROLES = new Set(['global', 'superadmin', 'role_super_admin', 'role_superadmin'])
const CONTROL_ESCOLAR_ROLE = 'role_ctrl'
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

export const isControlEscolarOnlyRole = (role: unknown) => {
  const roles = parseRoles(role).map(normalizeRole)
  return roles.length === 1 && roles[0] === CONTROL_ESCOLAR_ROLE
}

export const parsePlanteles = (value: unknown) => String(value || '')
  .split(',')
  .map(normalizePlantel)
  .filter(Boolean)

export const getSuperAdminPlanteles = () => [...PLANTELES_LIST]

export const isValidPlantelScope = (plantel: string) => plantel === 'GLOBAL' || VALID_PLANTELES.has(plantel)

const getCookiePlantel = (event: any, name: string) => normalizePlantel(getCookie(event, name))

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

const resolveAllowedPlanteles = (event: any) => {
  const cookiePlanteles = parsePlanteles(getCookie(event, 'auth_planteles'))
    .filter((plantel) => VALID_PLANTELES.has(plantel))

  return cookiePlanteles.length ? cookiePlanteles : [...PLANTELES_LIST]
}

export const resolveAuthHomePlantel = (event: any, allowedPlanteles: string[] = []) => {
  const explicitHome = getCookiePlantel(event, 'auth_home_plantel')
  if (explicitHome && VALID_PLANTELES.has(explicitHome) && allowedPlanteles.includes(explicitHome)) return explicitHome

  const bridgeAgent = getCookiePlantel(event, 'db_bridge_agent_id')
  if (bridgeAgent && VALID_PLANTELES.has(bridgeAgent) && allowedPlanteles.includes(bridgeAgent)) return bridgeAgent

  const activePlantel = getCookiePlantel(event, 'auth_active_plantel')
  if (activePlantel && VALID_PLANTELES.has(activePlantel) && allowedPlanteles.includes(activePlantel)) return activePlantel

  return allowedPlanteles[0] || PLANTELES_LIST[0]
}

const resolveActivePlantel = (event: any, allowedPlanteles: string[], isSuperAdmin: boolean) => {
  const cookieActive = getCookiePlantel(event, 'auth_active_plantel')

  if (cookieActive === 'GLOBAL' && isSuperAdmin) return 'GLOBAL'
  if (cookieActive && VALID_PLANTELES.has(cookieActive) && allowedPlanteles.includes(cookieActive)) return cookieActive

  const bridgeAgent = getCookiePlantel(event, 'db_bridge_agent_id')
  if (bridgeAgent && VALID_PLANTELES.has(bridgeAgent) && allowedPlanteles.includes(bridgeAgent)) return bridgeAgent

  return allowedPlanteles[0] || PLANTELES_LIST[0]
}

export const getTrustedAuthUser = async (event: any): Promise<AuthSessionUser> => {
  const email = String(getCookie(event, 'auth_email') || '').trim()

  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const role = String(getCookie(event, 'auth_role') || 'plantel').trim() || 'plantel'
  const roles = parseRoles(role)
  const superAdmin = isSuperAdminRole(role) || String(getCookie(event, 'auth_is_super_admin') || '') === 'true'
  const controlEscolar = hasControlEscolarRole(role)
  const controlEscolarOnly = !superAdmin && isControlEscolarOnlyRole(role)
  const allowedPlanteles = resolveAllowedPlanteles(event)
  const activePlantel = resolveActivePlantel(event, allowedPlanteles, superAdmin)
  const homePlantel = resolveAuthHomePlantel(event, allowedPlanteles)

  if (activePlantel && !isValidPlantelScope(activePlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel activo inválido.' })
  }

  if (activePlantel === 'GLOBAL' && !superAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para vista consolidada.' })
  }

  return {
    email,
    name: firstText(getCookie(event, 'auth_name'), email),
    role,
    roles,
    planteles: allowedPlanteles.join(','),
    plantelesList: allowedPlanteles,
    active_plantel: activePlantel,
    auth_home_plantel: homePlantel,
    isSuperAdmin: superAdmin,
    hasControlEscolarRole: controlEscolar,
    isControlEscolarOnly: controlEscolarOnly,
    hasFinancialAccess: superAdmin || !controlEscolarOnly
  }
}

export const resolveDataBridgeAgentId = (event: any, user: AuthSessionUser) => {
  if (user.active_plantel && user.active_plantel !== 'GLOBAL') return user.active_plantel

  const bridgeAgent = getCookiePlantel(event, 'db_bridge_agent_id')
  if (bridgeAgent && VALID_PLANTELES.has(bridgeAgent) && user.plantelesList.includes(bridgeAgent)) return bridgeAgent

  return user.auth_home_plantel || PLANTELES_LIST[0]
}
