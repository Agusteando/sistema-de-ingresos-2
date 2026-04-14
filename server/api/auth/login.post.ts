import { OAuth2Client } from 'google-auth-library'
import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  
  if (!config.public.googleClientId) {
    throw createError({ statusCode: 500, message: 'Configuración de Google ausente' })
  }

  const client = new OAuth2Client(config.public.googleClientId)
  
  try {
    const ticket = await client.verifyIdToken({
      idToken: body.credential,
      audience: config.public.googleClientId
    })
    
    const payload = ticket.getPayload()
    if (!payload || !payload.email) throw new Error('Token inválido')
    
    // Look up user by Google email
    let [user] = await query<any[]>('SELECT * FROM users WHERE email = ? OR username = ?', [payload.email, payload.email])
    
    // Just-In-Time (JIT) Provisioning
    if (!user) {
      const allUsers = await query<any[]>('SELECT id FROM users LIMIT 1')
      // If this is the absolute first login to the entire system, grant global admin
      const defaultRole = allUsers.length === 0 ? 'global' : 'plantel'
      const defaultPlantel = 'PT' 
      
      const result: any = await query(
        'INSERT INTO users (username, password, email, plantel, role, avatar) VALUES (?, ?, ?, ?, ?, ?)', 
        [payload.name || payload.email, 'GOOGLE_AUTH', payload.email, defaultPlantel, defaultRole, payload.picture || null]
      )
      
      user = {
        id: result.insertId,
        username: payload.name || payload.email,
        email: payload.email,
        plantel: defaultPlantel,
        role: defaultRole,
        avatar: payload.picture || null
      }
    } else {
      // Opportunistically update avatar to keep it fresh
      if (payload.picture && user.avatar !== payload.picture) {
        await query('UPDATE users SET avatar = ? WHERE id = ?', [payload.picture, user.id])
      }
    }
    
    // Strictly establish secure, client-accessible session cookies
    const cookieOpts = { secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 86400 * 7 }
    setCookie(event, 'auth_email', user.email || payload.email, cookieOpts)
    setCookie(event, 'auth_name', user.username || payload.name, cookieOpts)
    setCookie(event, 'auth_role', user.role || 'plantel', cookieOpts)
    setCookie(event, 'auth_plantel', user.plantel || 'PT', cookieOpts)
    
    return { success: true }
  } catch (error) {
    throw createError({ statusCode: 401, message: 'Fallo de autenticación con Google' })
  }
})