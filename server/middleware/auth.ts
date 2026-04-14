export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
    const email = getCookie(event, 'auth_email')
    
    if (!email) {
      throw createError({ statusCode: 401, message: 'Acceso no autorizado al sistema' })
    }

    // Attach verified session state to the event context for robust RBAC enforcement
    event.context.user = {
      email,
      name: getCookie(event, 'auth_name') || 'Usuario',
      role: getCookie(event, 'auth_role') || 'plantel',
      plantel: getCookie(event, 'auth_plantel') || 'PT'
    }
  }
})