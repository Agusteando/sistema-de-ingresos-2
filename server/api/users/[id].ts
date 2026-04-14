import { query } from '../../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  const method = event.node.req.method
  const user = event.context.user

  if (user.role !== 'global') {
    throw createError({ statusCode: 403, message: 'Acceso denegado' })
  }

  if (method === 'PUT') {
    const { username, password, email, plantel, role } = await readBody(event)
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10)
      await query('UPDATE users SET username=?, password=?, email=?, plantel=?, role=? WHERE id=?', [username, hash, email, plantel, role, id])
    } else {
      await query('UPDATE users SET username=?, email=?, plantel=?, role=? WHERE id=?', [username, email, plantel, role, id])
    }
    return { success: true }
  }
  
  if (method === 'DELETE') {
    await query('DELETE FROM users WHERE id=?', [id])
    return { success: true }
  }
})