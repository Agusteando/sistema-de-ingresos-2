export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
    const email = getCookie(event, 'auth_email')
    if (!email) {
      throw createError({ statusCode: 401, message: 'Acceso no autorizado al sistema' })
    }
  }
})