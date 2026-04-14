import { query } from '../../../utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  const method = event.node.req.method

  if (method === 'PUT') {
    const { username, password, email, plantel } = await readBody(event)
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10)
      await query('UPDATE users SET username=?, password=?, email=?, plantel=? WHERE id=?', [username, hash, email, plantel, id])
    } else {
      await query('UPDATE users SET username=?, email=?, plantel=? WHERE id=?', [username, email, plantel, id])
    }
    return { success: true }
  }
  
  if (method === 'DELETE') {
    await query('DELETE FROM users WHERE id=?', [id])
    return { success: true }
  }
})