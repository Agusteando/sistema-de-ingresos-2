export const authCookieFlagEnabled = (value: unknown) => {
  if (value === true || value === 1) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

export const authRoleTokens = (value: unknown) => String(value || '')
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean)

export const resolveClientAuthAccess = ({
  role,
  hasControlEscolar,
  hasFinancialAccess
}: {
  role: unknown
  hasControlEscolar?: unknown
  hasFinancialAccess?: unknown
}) => {
  const roles = authRoleTokens(role)
  const isSuperAdmin = roles.includes('superadmin')
  const hasControlRole = roles.includes('role_ctrl')
  const hasFinancialRole = roles.includes('role_admon')

  // Permission cookies are display hints only. The role is the client-side
  // source of truth, while the backend enforces the signed session snapshot.
  const controlAccess = isSuperAdmin || hasControlRole || (roles.length > 0 && !hasFinancialRole)
  const financialAccess = isSuperAdmin || hasFinancialRole

  return {
    roles,
    isSuperAdmin,
    hasControlRole,
    hasFinancialRole,
    controlAccess,
    financialAccess,
    controlEscolarOnly: controlAccess && !financialAccess
  }
}
