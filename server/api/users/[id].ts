import { query } from '../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  const method = event.node.req.method
  const user = event.context.user

  if (user.role !== 'global') {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  if (method === 'PUT') {
    const { username, password, email, planteles, role } = await readBody(event)
    const plantelesStr = Array.isArray(planteles) ? planteles.join(',') : planteles

    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10)
      await query('UPDATE users SET username=?, password=?, email=?, planteles=?, role=? WHERE id=?', [username, hash, email, plantelesStr, role, id])
    } else {
      await query('UPDATE users SET username=?, email=?, planteles=?, role=? WHERE id=?', [username, email, plantelesStr, role, id])
    }
    return { success: true }
  }
  
  if (method === 'DELETE') {
    await query('DELETE FROM users WHERE id=?', [id])
    return { success: true }
  }
})