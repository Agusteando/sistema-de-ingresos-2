import { query } from '../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  
  if (method === 'GET') {
    return await query('SELECT id, username, email, plantel, created_at, avatar FROM users ORDER BY username ASC')
  }
  
  if (method === 'POST') {
    const { username, password, email, plantel } = await readBody(event)
    const hash = bcrypt.hashSync(password, 10)
    await query('INSERT INTO users (username, password, email, plantel) VALUES (?, ?, ?, ?)', [username, hash, email, plantel])
    return { success: true }
  }
})