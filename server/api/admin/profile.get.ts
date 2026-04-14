import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const username = getCookie(event, 'auth_username')
  
  if (!username) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado' })
  }
  
  const [user] = await query<any[]>('SELECT avatar, username as name, email FROM users WHERE username = ?', [username])
  
  return { 
    photoUrl: user?.avatar || null, 
    email: user?.email || '', 
    name: user?.name || 'Administrador' 
  }
})