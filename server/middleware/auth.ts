export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
    const username = getCookie(event, 'auth_username')
    if (!username) {
      throw createError({ statusCode: 401, message: 'Acceso no autorizado al sistema' })
    }
  }
})