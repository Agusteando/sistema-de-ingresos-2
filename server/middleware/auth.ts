import { enterBridgeAgentId, ensureSchema, getDbTransport } from '../utils/db'
import { getTrustedAuthUser, resolveDataBridgeAgentId } from '../utils/auth-session'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/api/auth/')) return
  if (url.pathname.startsWith('/api/debug/')) return

  const user = await getTrustedAuthUser(event)
  event.context.user = user

  const isControlEscolarEndpoint = url.pathname.startsWith('/api/control-escolar/')
  const isDirectoryEndpoint = url.pathname.startsWith('/api/directory/')
  const isProfileEndpoint = url.pathname === '/api/admin/profile'

  if (isControlEscolarEndpoint || isDirectoryEndpoint || isProfileEndpoint) {
    return
  }

  if (user.isControlEscolarOnly) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  const bridgeAgentId = resolveDataBridgeAgentId(event, user)

  if (bridgeAgentId && bridgeAgentId !== 'GLOBAL') {
    event.context.dbBridgeAgentId = bridgeAgentId
    enterBridgeAgentId(bridgeAgentId)
  } else if (getDbTransport() === 'bridge') {
    throw createError({ statusCode: 401, message: 'Sesión sin plantel de datos para bridge mode.' })
  }

  if (url.pathname.startsWith('/api/admin/sql-console/')) {
    return
  }

  await ensureSchema()
})
