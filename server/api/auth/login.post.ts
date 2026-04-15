import { OAuth2Client } from 'google-auth-library'
import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  
  if (!config.public.googleClientId) {
    throw createError({ statusCode: 500, message: 'Configuración de Google ausente' })
  }

  if (!body || !body.credential) {
    throw createError({ statusCode: 400, message: 'Credencial ausente' })
  }

  const client = new OAuth2Client(config.public.googleClientId)
  
  try {
    const ticket = await client.verifyIdToken({
      idToken: body.credential,
      audience: config.public.googleClientId
    })
    
    const payload = ticket.getPayload()
    if (!payload || !payload.email) throw new Error('Token inválido')
    
    let [user] = await query<any[]>('SELECT * FROM users WHERE email = ?', [payload.email])
    
    const seedEmails = ['desarrollo.tecnologico@casitaiedis.edu.mx', 'coord.admon@casitaiedis.edu.mx']
    const isSeedAdmin = seedEmails.includes(payload.email)

    if (!user) {
      const allUsers = await query<any[]>('SELECT id FROM users LIMIT 1')
      const isFirstUser = allUsers.length === 0
      
      const defaultRole = (isSeedAdmin || isFirstUser) ? 'global' : 'plantel'
      const defaultPlanteles = (isSeedAdmin || isFirstUser) ? 'PREEM,PREET,CT,CM,DM,CO,DC,PM,PT,SM,ST,IS,ISM' : ''
      
      const result: any = await query(
        'INSERT INTO users (username, password, email, planteles, role, avatar) VALUES (?, ?, ?, ?, ?, ?)', 
        [payload.name || payload.email, 'GOOGLE_AUTH', payload.email, defaultPlanteles, defaultRole, payload.picture || null]
      )
      
      user = {
        id: result.insertId,
        username: payload.name || payload.email,
        email: payload.email,
        planteles: defaultPlanteles,
        role: defaultRole,
        avatar: payload.picture || null
      }
    } else {
      if (isSeedAdmin && user.role !== 'global') {
        user.role = 'global'
        await query('UPDATE users SET role = ? WHERE id = ?', ['global', user.id])
      }
      if (payload.picture && user.avatar !== payload.picture) {
        await query('UPDATE users SET avatar = ? WHERE id = ?', [payload.picture, user.id])
      }
    }
    
    const plantelesArr = user.planteles ? user.planteles.split(',') : []
    const activePlantel = plantelesArr.length > 0 ? plantelesArr[0] : ''

    const cookieOpts = { secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 86400 * 7 }
    setCookie(event, 'auth_email', user.email || payload.email, cookieOpts)
    setCookie(event, 'auth_name', user.username || payload.name, cookieOpts)
    setCookie(event, 'auth_role', user.role || 'plantel', cookieOpts)
    setCookie(event, 'auth_planteles', user.planteles || '', cookieOpts)
    setCookie(event, 'auth_active_plantel', activePlantel, cookieOpts)
    
    return { success: true }
  } catch (error: any) {
    console.error('[Auth Login Error]', error)
    throw createError({ statusCode: 401, message: error?.message || 'Error de autenticación con Google.' })
  }
})