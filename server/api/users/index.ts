import { query } from '../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  // Strict RBAC enforcement block
  if (user.role !== 'global') {
    throw createError({ statusCode: 403, message: 'No cuenta con los privilegios administrativos requeridos' })
  }
  
  if (method === 'GET') {
    return await query('SELECT id, username, email, plantel, role, created_at, avatar FROM users ORDER BY username ASC')
  }
  
  if (method === 'POST') {
    const { username, password, email, plantel, role } = await readBody(event)
    const hash = bcrypt.hashSync(password, 10)
    await query('INSERT INTO users (username, password, email, plantel, role) VALUES (?, ?, ?, ?, ?)', [username, hash, email, plantel, role])
    return { success: true }
  }
})