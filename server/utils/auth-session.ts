import { PLANTELES_LIST } from '../../utils/constants'
import { verifyImpersonationToken } from './impersonation-session'
import { readAuthSessionToken } from './auth-session-token'

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
 * Financial access is explicit. Unknown, empty and legacy roles are normalized
 * to ROLE_CTRL so they fail closed and never inherit access to Finanzas.
 */
export const normalizeAuthRole = (role: unknown) => {
  if (isSuperAdminRole(role)) return 'superadmin'

  const source = parseRoles(role)
  const normalized: string[] = []
  if (hasControlEscolarRole(source.join(','))) normalized.push(CONTROL_ESCOLAR_ROLE)
  if (hasFinancialAdminRole(source.join(','))) normalized.push(FINANCIAL_ADMIN_ROLE)
  return normalized.length ? normalized.join(',') : CONTROL_ESCOLAR_ROLE
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

  return hasFinancialAdminRole(normalizeAuthRole(role))
}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

export const getTrustedAuthUser = async (event: any): Promise<AuthSessionUser> => {
  if (event?.context?.trustedAuthUser) return event.context.trustedAuthUser as AuthSessionUser

  let signedSession: ReturnType<typeof readAuthSessionToken>
  try {
    signedSession = readAuthSessionToken(event)
  } catch (error: any) {
    if (Number(error?.statusCode || error?.status || 0) === 401) {
      for (const cookieName of [
        'auth_email',
        'auth_name',
        'auth_role',
        'auth_planteles',
        'auth_active_plantel',
        'auth_home_plantel',
        'auth_financial_planteles',
        'auth_nav_mode',
        'auth_has_control_escolar',
        'auth_has_financial_access',
        'db_bridge_agent_id'
      ]) {
        deleteCookie(event, cookieName, { path: '/' })
      }
    }
    throw error
  }

  // Impersonation keeps its own signed expiration boundary in addition to the
  // signed effective-session snapshot.
  const impersonationToken = getCookie(event, 'auth_impersonation_token')
  if (impersonationToken) verifyImpersonationToken(impersonationToken)

  const email = String(signedSession.email || '').trim().toLowerCase()
  const role = normalizeAuthRole(signedSession.role)
  const roles = parseRoles(role)
  const superAdmin = isSuperAdminRole(role)
  const allowedPlanteles = superAdmin
    ? [...PLANTELES_LIST]
    : parsePlanteles(signedSession.planteles)

  if (!email) throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  if (!superAdmin && !allowedPlanteles.length) {
    throw createError({ statusCode: 403, message: 'La sesión no tiene un plantel asignado.' })
  }

  const fallbackPlantel = allowedPlanteles[0] || PLANTELES_LIST[0] || ''
  if (!fallbackPlantel) throw createError({ statusCode: 500, message: 'No hay planteles configurados.' })

  const allowedSet = new Set(allowedPlanteles)
  const signedActive = normalizePlantel(signedSession.activePlantel)
  const activePlantel = signedActive === 'GLOBAL' && superAdmin
    ? 'GLOBAL'
    : signedActive && allowedSet.has(signedActive)
      ? signedActive
      : fallbackPlantel

  const signedHome = normalizePlantel(signedSession.homePlantel)
  const homePlantel = signedHome && allowedSet.has(signedHome)
    ? signedHome
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
    name: firstText(signedSession.name, email),
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

  return user.auth_home_plantel || PLANTELES_LIST[0]
}
