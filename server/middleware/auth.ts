import { ensureSchema } from '../utils/db'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/api/')) {
    return
  }

  if (url.pathname.startsWith('/api/auth/')) {
    return
  }

  if (url.pathname.startsWith('/api/debug/')) {
    return
  }

  const email = getCookie(event, 'auth_email')

  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const activePlantel = getCookie(event, 'auth_active_plantel') || ''
  const bridgeAgentId = getCookie(event, 'db_bridge_agent_id') || activePlantel

  event.context.user = {
    email,
    name: getCookie(event, 'auth_name') || 'Usuario',
    role: getCookie(event, 'auth_role') || 'plantel',
    planteles: getCookie(event, 'auth_planteles') || '',
    active_plantel: activePlantel
  }

  if (bridgeAgentId && bridgeAgentId !== 'GLOBAL') {
    event.context.dbBridgeAgentId = bridgeAgentId
  }

  await ensureSchema()
})