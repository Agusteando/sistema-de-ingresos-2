import { query } from '../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const { username, password } = await readBody(event)

  if (!username || !password) {
    throw createError({ statusCode: 400, message: 'Credenciales incompletas' })
  }

  const users = await query<any[]>('SELECT * FROM users')
  
  // Auto-provision default admin if the users table is completely empty to prevent lockout
  if (users.length === 0 && username === 'admin' && password === 'admin') {
    const hash = bcrypt.hashSync('admin', 10)
    await query("INSERT INTO users (username, password, email, plantel) VALUES ('admin', ?, 'admin@ejemplo.com', 'PT')", [hash])
    
    setCookie(event, 'auth_username', 'admin', { path: '/', maxAge: 86400 * 7 })
    setCookie(event, 'auth_id', '1', { path: '/', maxAge: 86400 * 7 })
    setCookie(event, 'auth_name', 'Administrador Principal', { path: '/', maxAge: 86400 * 7 })
    return { success: true }
  }

  const [user] = await query<any[]>('SELECT * FROM users WHERE username = ?', [username])
  
  if (!user) {
    throw createError({ statusCode: 401, message: 'Credenciales inválidas' })
  }

  // Gracefully handle both plain text legacy passwords and proper bcrypt hashes
  const isMatch = (password === user.password) || bcrypt.compareSync(password, user.password)

  if (!isMatch) {
    throw createError({ statusCode: 401, message: 'Credenciales inválidas' })
  }
  
  setCookie(event, 'auth_username', user.username, { 
    secure: process.env.NODE_ENV === 'production', 
    path: '/', 
    maxAge: 86400 * 7 
  })
  
  setCookie(event, 'auth_id', String(user.id), { 
    secure: process.env.NODE_ENV === 'production', 
    path: '/', 
    maxAge: 86400 * 7 
  })

  setCookie(event, 'auth_name', user.username, { 
    secure: process.env.NODE_ENV === 'production',
    path: '/', 
    maxAge: 86400 * 7 
  })
  
  return { success: true }
})