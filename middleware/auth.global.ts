export default defineNuxtRouteMiddleware((to) => {
  const email = useCookie('auth_email')
  
  if (!email.value && to.path !== '/login' && !to.path.startsWith('/print')) {
    return navigateTo('/login')
  }
  
  if (email.value && to.path === '/login') {
    return navigateTo('/')
  }
})