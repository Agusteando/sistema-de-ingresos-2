import { resolveClientAuthAccess } from '~/utils/authAccess'

export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const planteles = useCookie('auth_planteles')
  const role = useCookie('auth_role')
  const hasControlEscolarCookie = useCookie('auth_has_control_escolar')
  const hasFinancialAccessCookie = useCookie('auth_has_financial_access')
  const isVisualLabPath = to.path.startsWith('/__visual-lab')
  const access = resolveClientAuthAccess({
    role: role.value,
    hasControlEscolar: hasControlEscolarCookie.value,
    hasFinancialAccess: hasFinancialAccessCookie.value
  })
  const { isSuperAdmin, controlAccess: hasControlEscolar, financialAccess: hasFinancialAccess } = access
  const defaultRoute = hasFinancialAccess ? '/' : '/control-escolar'
  const isPublicPath = to.path === '/login' || to.path.startsWith('/print')
  const isControlEscolarPath = ['/control-escolar', '/avance-control-escolar'].includes(to.path)

  // Permanent dev-only visual lab. Do not remove without replacing docs/visual-testing.md.
  if (isVisualLabPath) {
    if (import.meta.dev) return
    return navigateTo(email.value ? defaultRoute : '/login')
  }

  if (!email.value && !isPublicPath) {
    return navigateTo('/login')
  }

  if (email.value && to.path === '/login') {
    return navigateTo(defaultRoute)
  }

  if (email.value && !isSuperAdmin && !planteles.value && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/onboarding')
  }

  if (email.value && planteles.value && to.path === '/onboarding') {
    return navigateTo(defaultRoute)
  }

  if (email.value && to.path === '/sql-console' && !isSuperAdmin) {
    return navigateTo(defaultRoute)
  }

  if (email.value && to.path === '/usuarios' && !isSuperAdmin) {
    return navigateTo(defaultRoute)
  }

  if (email.value && isControlEscolarPath && !hasControlEscolar) {
    return navigateTo(hasFinancialAccess ? '/' : '/login')
  }

  if (email.value && !isControlEscolarPath && !hasFinancialAccess && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo(hasControlEscolar ? '/control-escolar' : '/login')
  }
})
