export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = getCookie(event, 'auth_email')
  const role = getCookie(event, 'auth_role')
  const planteles = getCookie(event, 'auth_planteles') || ''

  if (!email) {
    throw createError({ statusCode: 401, message: 'Sesión expirada o no válida.' })
  }

  const allowed = planteles.split(',').map(p => p.trim()).filter(Boolean)
  const requested = String(body.plantel || '').trim()

  if (!requested) {
    throw createError({ statusCode: 400, message: 'Plantel requerido.' })
  }

  if (role !== 'global' && !allowed.includes(requested) && requested !== 'GLOBAL') {
    throw createError({ statusCode: 403, message: 'No tiene permisos para acceder a este plantel.' })
  }

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400 * 7
  }

  setCookie(event, 'auth_active_plantel', requested, cookieOpts)

  if (requested !== 'GLOBAL') {
    setCookie(event, 'db_bridge_agent_id', requested, cookieOpts)
  }

  return { success: true }
})