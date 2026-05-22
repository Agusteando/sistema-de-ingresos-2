import { isExternalUsersAvailable, updateExternalControlEscolarAccess, updateExternalUser } from '../../utils/external-users'

const assertExternalUsersAvailable = async () => {
  if (await isExternalUsersAvailable()) return
  throw createError({
    statusCode: 503,
    message: 'No se pudo consultar la configuración de accesos de Control Escolar. Intente de nuevo o revise la conexión con la base central.'
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
    if (typeof body?.enabled === 'boolean') return await updateExternalControlEscolarAccess(body)
    return await updateExternalUser(id, body)
  }

  if (method === 'DELETE') {
    throw createError({ statusCode: 405, message: 'No se eliminan usuarios desde esta pantalla. Para retirar permisos, revoque el acceso a Control Escolar.' })
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
