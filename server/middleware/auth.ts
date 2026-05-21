import { enterBridgeAgentId, ensureSchema, getDbTransport } from '../utils/db'
import { getTrustedAuthUser, resolveDataBridgeAgentId } from '../utils/auth-session'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/api/auth/')) return
  if (url.pathname.startsWith('/api/debug/')) return

  const user = await getTrustedAuthUser(event)
  event.context.user = user

  if (url.pathname.startsWith('/api/control-escolar/')) {
    return
  }

  if (url.pathname === '/api/admin/profile') {
    return
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
