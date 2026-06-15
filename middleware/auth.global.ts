const SUPERADMIN_ROLES = new Set(['superadmin'])

const roleTokensFrom = (value: unknown) => String(value || '')
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean)

export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const planteles = useCookie('auth_planteles')
  const role = useCookie('auth_role')
  const hasFinancialAccessCookie = useCookie('auth_has_financial_access')
  const isVisualLabPath = to.path.startsWith('/__visual-lab')
  const roleTokens = roleTokensFrom(role.value)
  const isSuperAdmin = roleTokens.some((entry) => SUPERADMIN_ROLES.has(entry))
  const hasFinancialAccess = isSuperAdmin || hasFinancialAccessCookie.value === 'true'
  const isPublicPath = to.path === '/login' || to.path.startsWith('/print')
  const isControlEscolarPath = ['/control-escolar', '/avance-control-escolar'].includes(to.path)

  // Permanent dev-only visual lab. Do not remove without replacing docs/visual-testing.md.
  if (isVisualLabPath) {
    if (import.meta.dev) return
    return navigateTo(email.value ? (hasFinancialAccess ? '/' : '/control-escolar') : '/login')
  }

  if (!email.value && !isPublicPath) {
    return navigateTo('/login')
  }

  if (email.value && to.path === '/login') {
    return navigateTo(hasFinancialAccess ? '/' : '/control-escolar')
  }

  if (email.value && !isSuperAdmin && !planteles.value && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/onboarding')
  }

  if (email.value && planteles.value && to.path === '/onboarding') {
    return navigateTo(hasFinancialAccess ? '/' : '/control-escolar')
  }

  if (email.value && to.path === '/sql-console' && !isSuperAdmin) {
    return navigateTo(hasFinancialAccess ? '/' : '/control-escolar')
  }

  if (email.value && to.path === '/usuarios' && !isSuperAdmin) {
    return navigateTo(hasFinancialAccess ? '/' : '/control-escolar')
  }

  if (email.value && !hasFinancialAccess && !isControlEscolarPath && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/control-escolar')
  }
})
