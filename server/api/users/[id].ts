import bcrypt from 'bcryptjs'
import { query } from '../../utils/db'
import { deleteExternalUser, isExternalUsersAvailable, updateExternalUser } from '../../utils/external-users'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  if (method === 'PUT') {
    const body = await readBody(event)
    if (await isExternalUsersAvailable()) {
      return await updateExternalUser(id, body)
    }

    const plantelesStr = Array.isArray(body.planteles) ? body.planteles.join(',') : String(body.planteles || '')
    const updates = ['username = ?', 'email = ?', 'planteles = ?', 'role = ?', 'plantel = ?']
    const params: any[] = [
      body.username,
      body.email,
      plantelesStr,
      body.role || 'plantel',
      Array.isArray(body.planteles) && body.planteles.length > 0 ? body.planteles[0] : ''
    ]

    if (body.password && String(body.password).trim()) {
      updates.push('password = ?')
      params.push(bcrypt.hashSync(body.password, 10))
    }

    params.push(id)
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    return { success: true }
  }

  if (method === 'DELETE') {
    if (await isExternalUsersAvailable()) {
      return await deleteExternalUser(id)
    }

    await query('DELETE FROM users WHERE id = ?', [id])
    return { success: true }
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
