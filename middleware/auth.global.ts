export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  const isPublicPath = to.path === '/login' || to.path.startsWith('/print')

  if (!email.value && !isPublicPath) {
    return navigateTo('/login')
  }

  if (email.value && to.path === '/login') {
    return navigateTo('/')
  }

  if (email.value && to.path === '/onboarding') {
    return navigateTo('/')
  }
})
