import { PLANTELES_LIST } from '../../utils/constants'
import { verifyImpersonationToken } from './impersonation-session'

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
export const CONTROL_ESCOLAR_ROLE = 'ROLE_CTRL'
export const FINANCIAL_ADMIN_ROLE = 'ROLE_ADMON'
const LEGACY_FINANCIAL_ROLE = 'plantel'
const VALID_PLANTELES = new Set(PLANTELES_LIST)

export const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase()

export const parseRoles = (value: unknown) => String(value || '')
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean)

const normalizeRoleToken = (role: unknown) => String(role || '').trim().toLowerCase()

export const hasRole = (roleValue: unknown, roleName: string) => {
  const target = normalizeRoleToken(roleName)
  return parseRoles(roleValue).some((role) => normalizeRoleToken(role) === target)
}

export const isSuperAdminRole = (role: unknown) => parseRoles(role)
  .some((entry) => SUPERADMIN_ROLES.has(normalizeRoleToken(entry)))

export const hasControlEscolarRole = (role: unknown) => hasRole(role, CONTROL_ESCOLAR_ROLE)
export const hasFinancialAdminRole = (role: unknown) => hasRole(role, FINANCIAL_ADMIN_ROLE)

/**
 * Keep the legacy financial role semantics from ebe34bf. Before ROLE_ADMON was
 * introduced, every authenticated non-ROLE_CTRL account used the financial
 * workspace. ROLE_ADMON is supported explicitly, but legacy role values are
 * intentionally preserved instead of being rewritten to ROLE_CTRL.
 */
export const normalizeAuthRole = (role: unknown) => {
  if (isSuperAdminRole(role)) return 'superadmin'

  const source = parseRoles(role)
  const normalized: string[] = []
  if (hasControlEscolarRole(source.join(','))) normalized.push(CONTROL_ESCOLAR_ROLE)
  if (hasFinancialAdminRole(source.join(','))) normalized.push(FINANCIAL_ADMIN_ROLE)
  if (normalized.length) return normalized.join(',')

  const legacy = source
    .map((entry) => String(entry || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80))
    .find(Boolean)

  return legacy || LEGACY_FINANCIAL_ROLE
}

export const isControlEscolarOnlyRole = (role: unknown) => {
  const normalized = normalizeAuthRole(role)
  return hasControlEscolarRole(normalized) && !hasFinancialAdminRole(normalized)
}

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
  if (!parsePlanteles(assignedPlanteles).includes(plantel)) return false

  const normalized = normalizeAuthRole(role)
  if (hasFinancialAdminRole(normalized)) return true
  if (hasControlEscolarRole(normalized)) return false

  // Legacy behavior from ebe34bf: any authenticated role that was not the
  // dedicated Control Escolar role entered the financial workspace.
  return true
}

const getCookiePlantel = (event: any, name: string) => normalizePlantel(getCookie(event, name))

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

const resolveCookiePlanteles = (event: any, superAdmin: boolean) => {
  if (superAdmin) return [...PLANTELES_LIST]

  const assigned = parsePlanteles(getCookie(event, 'auth_planteles'))
  if (assigned.length) return assigned

  // Preserve the old session fallback without granting a global scope. This is
  // only used for legacy sessions created before auth_planteles existed.
  const candidates = [
    getCookiePlantel(event, 'auth_home_plantel'),
    getCookiePlantel(event, 'auth_active_plantel'),
    getCookiePlantel(event, 'db_bridge_agent_id')
  ].filter((plantel) => VALID_PLANTELES.has(plantel))

  return Array.from(new Set(candidates))
}

export const getTrustedAuthUser = async (event: any): Promise<AuthSessionUser> => {
  if (event?.context?.trustedAuthUser) return event.context.trustedAuthUser as AuthSessionUser

  const email = String(getCookie(event, 'auth_email') || '').trim().toLowerCase()
  if (!email) throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })

  // Impersonation still has a signed expiration boundary. The target identity,
  // role and planteles are the snapshot cookies written by the start endpoint.
  const impersonationToken = getCookie(event, 'auth_impersonation_token')
  if (impersonationToken) verifyImpersonationToken(impersonationToken)

  const role = normalizeAuthRole(getCookie(event, 'auth_role') || LEGACY_FINANCIAL_ROLE)
  const roles = parseRoles(role)
  const superAdmin = isSuperAdminRole(role)
  const allowedPlanteles = resolveCookiePlanteles(event, superAdmin)

  if (!superAdmin && !allowedPlanteles.length) {
    throw createError({ statusCode: 403, message: 'La sesión no tiene un plantel asignado.' })
  }

  const fallbackPlantel = allowedPlanteles[0] || PLANTELES_LIST[0] || ''
  if (!fallbackPlantel) throw createError({ statusCode: 500, message: 'No hay planteles configurados.' })

  const allowedSet = new Set(allowedPlanteles)
  const cookieActive = getCookiePlantel(event, 'auth_active_plantel')
  const activePlantel = cookieActive === 'GLOBAL' && superAdmin
    ? 'GLOBAL'
    : cookieActive && allowedSet.has(cookieActive)
      ? cookieActive
      : fallbackPlantel

  const cookieHome = getCookiePlantel(event, 'auth_home_plantel')
  const homePlantel = cookieHome && allowedSet.has(cookieHome)
    ? cookieHome
    : (activePlantel !== 'GLOBAL' ? activePlantel : fallbackPlantel)

  if (!isValidPlantelScope(activePlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel activo inválido.' })
  }
  if (activePlantel === 'GLOBAL' && !superAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para vista consolidada.' })
  }

  const controlAccess = superAdmin || hasControlEscolarRole(role)
  const financialPlanteles = superAdmin
    ? [...allowedPlanteles]
    : allowedPlanteles.filter((plantel) => hasFinancialAccessForPlantel(role, allowedPlanteles, plantel))
  const financialAccess = hasFinancialAccessForPlantel(role, allowedPlanteles, activePlantel)
  const controlEscolarOnly = controlAccess && !financialAccess

  const user: AuthSessionUser = {
    email,
    name: firstText(getCookie(event, 'auth_name'), email),
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
