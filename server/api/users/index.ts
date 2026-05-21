import { createExternalUser, isExternalUsersAvailable, listExternalUsers } from '../../utils/external-users'

const assertExternalUsersAvailable = async () => {
  if (await isExternalUsersAvailable()) return
  throw createError({
    statusCode: 503,
    message: 'La tabla externa users no esta disponible. La asignacion ROLE_CTRL se guarda exclusivamente en la base externa de Control Escolar.'
  })
}

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  await assertExternalUsersAvailable()

  if (method === 'GET') {
    return await listExternalUsers()
  }

  if (method === 'POST') {
    const body = await readBody(event)
    return await createExternalUser(body)
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
