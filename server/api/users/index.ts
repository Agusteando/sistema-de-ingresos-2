import bcrypt from 'bcryptjs'
import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  if (method === 'GET') {
    return await query(`
      SELECT id, username, username AS displayName, email, planteles, role, created_at, avatar
      FROM users
      ORDER BY username ASC
    `)
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const plantelesStr = Array.isArray(body.planteles) ? body.planteles.join(',') : String(body.planteles || '')

    await query(
      `INSERT INTO users (username, password, email, planteles, role, plantel) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        body.username,
        body.password ? bcrypt.hashSync(body.password, 10) : '',
        body.email,
        plantelesStr,
        body.role || 'plantel',
        Array.isArray(body.planteles) && body.planteles.length > 0 ? body.planteles[0] : ''
      ]
    )
    return { success: true }
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
