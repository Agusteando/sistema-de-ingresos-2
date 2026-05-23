import { createExternalUser, getExternalUsersDiagnostics, isExternalUsersAvailable, listExternalUsers } from '../../utils/external-users'

const assertExternalUsersAvailable = async () => {
  if (await isExternalUsersAvailable()) return
  const diagnostics = await getExternalUsersDiagnostics()
  throw createError({
    statusCode: 503,
    message: diagnostics?.errorMessage || 'No se pudo cargar el directorio de usuarios.',
    data: diagnostics
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
    const query = getQuery(event)
    return await listExternalUsers(query.q || query.search || '')
  }

  if (method === 'POST') {
    const body = await readBody(event)
    return await createExternalUser(body)
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
