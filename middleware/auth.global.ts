const SUPERADMIN_ROLES = new Set(['superadmin'])
const CONTROL_ESCOLAR_ROLE = 'role_ctrl'

const roleTokensFrom = (value: unknown) => String(value || '')
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean)

export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const planteles = useCookie('auth_planteles')
  const role = useCookie('auth_role')
  const hasControlEscolarCookie = useCookie('auth_has_control_escolar')
  const roleTokens = roleTokensFrom(role.value)
  const isSuperAdmin = roleTokens.some((entry) => SUPERADMIN_ROLES.has(entry))
  const hasControlEscolarRole = hasControlEscolarCookie.value === 'true' || roleTokens.includes(CONTROL_ESCOLAR_ROLE)
  const isControlEscolarOnly = !isSuperAdmin && roleTokens.includes(CONTROL_ESCOLAR_ROLE)
  const isPublicPath = to.path === '/login' || to.path.startsWith('/print')

  if (!email.value && !isPublicPath) {
    return navigateTo('/login')
  }

  if (email.value && to.path === '/login') {
    return navigateTo(isControlEscolarOnly ? '/control-escolar' : '/')
  }

  if (email.value && isControlEscolarOnly && !['/control-escolar', '/avance-control-escolar'].includes(to.path) && !to.path.startsWith('/print')) {
    return navigateTo('/control-escolar')
  }

  if (email.value && to.path === '/control-escolar' && !isSuperAdmin && !hasControlEscolarRole) {
    return navigateTo('/')
  }

  if (email.value && to.path === '/sql-console' && !isSuperAdmin) {
    return navigateTo('/')
  }

  if (email.value && !isSuperAdmin && !isControlEscolarOnly && !planteles.value && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/onboarding')
  }

  if (email.value && (planteles.value || isControlEscolarOnly) && to.path === '/onboarding') {
    return navigateTo(isControlEscolarOnly ? '/control-escolar' : '/')
  }
})
