import { ensureSchema } from '../utils/db'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/api/')) {
    return
  }

  if (url.pathname.startsWith('/api/auth/')) {
    return
  }

  await ensureSchema()

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
})