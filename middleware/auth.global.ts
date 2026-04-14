export default defineNuxtRouteMiddleware((to) => {
  const username = useCookie('auth_username')
  
  if (!username.value && to.path !== '/login' && !to.path.startsWith('/print')) {
    return navigateTo('/login')
  }
  
  if (username.value && to.path === '/login') {
    return navigateTo('/')
  }
})