import { deleteExternalUser, getExternalUsersDiagnostics, isExternalUsersAvailable, updateExternalUser } from '../../utils/external-users'

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
  const id = event.context.params?.id
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  await assertExternalUsersAvailable()

  if (method === 'PUT') {
    const body = await readBody(event)
    return await updateExternalUser(id, body)
  }

  if (method === 'DELETE') {
    return await deleteExternalUser(id)
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
