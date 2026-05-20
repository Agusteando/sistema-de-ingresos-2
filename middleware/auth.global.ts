const SUPERADMIN_ROLES = new Set(['global', 'superadmin', 'role_super_admin', 'role_superadmin'])
const CONTROL_ESCOLAR_ROLE = 'role_ctrl'

const roleTokensFrom = (value: unknown) => String(value || '')
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean)

export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const planteles = useCookie('auth_planteles')
  const role = useCookie('auth_role')
  const isSuperAdminCookie = useCookie('auth_is_super_admin')
  const hasControlEscolarCookie = useCookie('auth_has_control_escolar')
  const roleTokens = roleTokensFrom(role.value)
  const isSuperAdmin = isSuperAdminCookie.value === 'true' || roleTokens.some((entry) => SUPERADMIN_ROLES.has(entry))
  const hasControlEscolarRole = hasControlEscolarCookie.value === 'true' || roleTokens.includes(CONTROL_ESCOLAR_ROLE)
  const isControlEscolarOnly = !isSuperAdmin && roleTokens.length === 1 && roleTokens[0] === CONTROL_ESCOLAR_ROLE
  const isPublicPath = to.path === '/login' || to.path.startsWith('/print')

  if (!email.value && !isPublicPath) {
    return navigateTo('/login')
  }

  if (email.value && to.path === '/login') {
    return navigateTo(isControlEscolarOnly ? '/control-escolar' : '/')
  }

  if (email.value && isControlEscolarOnly && to.path !== '/control-escolar' && !to.path.startsWith('/print')) {
    return navigateTo('/control-escolar')
  }

  if (email.value && to.path === '/control-escolar' && !isSuperAdmin && !hasControlEscolarRole) {
    return navigateTo('/')
  }

  if (email.value && !isSuperAdmin && !isControlEscolarOnly && !planteles.value && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/onboarding')
  }

  if (email.value && (planteles.value || isControlEscolarOnly) && to.path === '/onboarding') {
    return navigateTo(isControlEscolarOnly ? '/control-escolar' : '/')
  }
})
