export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const planteles = useCookie('auth_planteles')
  const role = useCookie('auth_role')
  const isSuperAdmin = ['global', 'superadmin'].includes(String(role.value || '').toLowerCase())
  
  if (!email.value && to.path !== '/login' && !to.path.startsWith('/print')) {
    return navigateTo('/login')
  }
  
  if (email.value && to.path === '/login') {
    return navigateTo('/')
  }

  if (email.value && !isSuperAdmin && !planteles.value && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/onboarding')
  }

  if (email.value && planteles.value && to.path === '/onboarding') {
    return navigateTo('/')
  }
})