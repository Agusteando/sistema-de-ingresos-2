export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const planteles = useCookie('auth_planteles')
  const role = useCookie('auth_role')
  
  if (!email.value && to.path !== '/login' && !to.path.startsWith('/print')) {
    return navigateTo('/login')
  }
  
  if (email.value && to.path === '/login') {
    return navigateTo('/')
  }

  // Force onboarding if user is authenticated but lacks any assigned plantel
  if (email.value && role.value !== 'global' && !planteles.value && to.path !== '/onboarding' && !to.path.startsWith('/print')) {
    return navigateTo('/onboarding')
  }

  // Prevent users from accessing onboarding if they already have an assignment
  if (email.value && planteles.value && to.path === '/onboarding') {
    return navigateTo('/')
  }
})