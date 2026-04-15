import { ensureSchema } from '../utils/db'

export default defineEventHandler(async (event) => {
  // Garantizamos que el esquema esté inyectado y listo ANTES de procesar peticiones web.
  // Esto previene race-conditions en entornos Serverless (Vercel)
  await ensureSchema()

  const url = getRequestURL(event)
  
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
    const email = getCookie(event, 'auth_email')
    
    if (!email) {
      throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
    }

    event.context.user = {
      email,
      name: getCookie(event, 'auth_name') || 'Usuario',
      role: getCookie(event, 'auth_role') || 'plantel',
      planteles: getCookie(event, 'auth_planteles') || '',
      active_plantel: getCookie(event, 'auth_active_plantel') || ''
    }
  }
})