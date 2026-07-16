import { resolveClientAuthAccess } from '~/utils/authAccess'

const PUBLIC_AUTH_COOKIE_NAMES = [
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
  'auth_is_super_admin',
  'db_bridge_agent_id'
]

const clearRouteAuthCookies = () => {
  const cookieNames = process.server
    ? [...PUBLIC_AUTH_COOKIE_NAMES, 'auth_session_token']
    : PUBLIC_AUTH_COOKIE_NAMES
  for (const cookieName of cookieNames) {
    useCookie(cookieName).value = null
  }
}

const isAuthSessionFailure = (error: any) => {
  const status = Number(error?.statusCode || error?.status || error?.response?.status || 0)
  const code = String(
    error?.data?.diagnostic?.code ||
    error?.response?._data?.data?.diagnostic?.code ||
    error?.response?._data?.diagnostic?.code ||
    error?.code ||
    ''
  ).toUpperCase()
  const message = String(
    error?.data?.diagnostic?.message ||
    error?.response?._data?.data?.diagnostic?.message ||
    error?.response?._data?.message ||
    error?.message ||
    ''
  )
  return status === 401 || status === 403 || code.startsWith('AUTH_SESSION_') || /sesión|session|autorizado|authorized/i.test(message)
}

const loginExpiredQuery = (value: unknown) => String(Array.isArray(value) ? value[0] : value || '') === 'expired'

const sessionDefaultRoute = (session: any, fallback = '/') => {
  if (session?.hasFinancialAccess) return '/'
  if (session?.hasControlEscolarRole) return '/control-escolar'
  return fallback
}

export default defineNuxtRouteMiddleware(async (to) => {
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
  const isControlEscolarPath = ['/control-escolar', '/avance-control-escolar', '/auditoria-control-escolar'].includes(to.path)
  const isExpiredLogin = to.path === '/login' && loginExpiredQuery(to.query?.session)

  // Permanent dev-only visual lab. Do not remove without replacing docs/visual-testing.md.
  if (isVisualLabPath) {
    if (import.meta.dev) return
    return navigateTo(email.value ? defaultRoute : '/login')
  }

  if (isExpiredLogin) {
    clearRouteAuthCookies()
    return
  }

  if (!email.value && !isPublicPath) {
    return navigateTo('/login')
  }

  if (email.value && !to.path.startsWith('/print')) {
    try {
      const session = await $fetch('/api/auth/session', {
        retry: 0,
        headers: process.server ? useRequestHeaders(['cookie']) : undefined
      })
      if (to.path === '/login') return navigateTo(sessionDefaultRoute(session, defaultRoute))
    } catch (error) {
      if (isAuthSessionFailure(error)) {
        clearRouteAuthCookies()
        if (to.path === '/login') return
        return navigateTo({ path: '/login', query: { session: 'expired' } })
      }
      throw error
    }
  }

  if (process.client && email.value && to.path === '/login') {
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
