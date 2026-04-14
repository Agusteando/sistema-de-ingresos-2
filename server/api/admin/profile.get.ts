import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const email = getCookie(event, 'auth_email')
  
  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }
  
  const [user] = await query<any[]>('SELECT avatar, username as name, email FROM users WHERE email = ?', [email])
  
  return { 
    photoUrl: user?.avatar || null, 
    email: user?.email || '', 
    name: user?.name || 'Administrador' 
  }
})