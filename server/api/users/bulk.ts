import { bulkUpdateExternalUsers, getExternalUsersDiagnostics, isExternalUsersAvailable } from '../../utils/external-users'

const assertExternalUsersAvailable = async () => {
  if (await isExternalUsersAvailable()) return
  const debug = await getExternalUsersDiagnostics()
  throw createError({
    statusCode: 503,
    message: 'No se pudo cargar el directorio de usuarios.',
    data: { debug }
  })
}

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  if (method !== 'PATCH' && method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
  }

  await assertExternalUsersAvailable()
  const body = await readBody(event)
  return await bulkUpdateExternalUsers(body)
})
