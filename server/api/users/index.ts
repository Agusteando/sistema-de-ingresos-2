import { query } from '../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (user.role !== 'global') {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }
  
  if (method === 'GET') {
    return await query('SELECT id, username, email, planteles, role, created_at, avatar FROM users ORDER BY username ASC')
  }
  
  if (method === 'POST') {
    const { username, password, email, planteles, role } = await readBody(event)
    const hash = bcrypt.hashSync(password, 10)
    const plantelesStr = Array.isArray(planteles) ? planteles.join(',') : planteles
    
    // Inyectar compatibilidad con base de datos legacy para evitar error de STRICT MODE (Field 'plantel' doesn't have a default value)
    const legacyPlantel = Array.isArray(planteles) && planteles.length > 0 ? planteles[0] : ''

    await query(
      'INSERT INTO users (username, password, email, planteles, role, plantel) VALUES (?, ?, ?, ?, ?, ?)', 
      [username, hash, email, plantelesStr, role, legacyPlantel]
    )
    return { success: true }
  }
})