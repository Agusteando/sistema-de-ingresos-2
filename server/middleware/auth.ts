import { enterBridgeAgentId, getDbTransport } from '../utils/db'
import { getTrustedAuthUser, resolveDataBridgeAgentId } from '../utils/auth-session'

const noAdeudoMiddlewareDiagnostic = (event: any, diagnostic: Record<string, any>) => {
  setResponseStatus(event, 200)
  return {
    ok: false,
    error: diagnostic.title,
    message: diagnostic.title,
    diagnostic,
    diagnostics: [diagnostic],
    total: 0,
    students: [],
    results: [{ matricula: 'Lote', success: false, message: diagnostic.title, diagnostic }]
  }
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const isNoAdeudoEndpoint = url.pathname.startsWith('/api/no-adeudo/') && !url.pathname.startsWith('/api/no-adeudo/verify/')

  if (!url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/api/auth/')) return
  if (url.pathname.startsWith('/api/debug/')) return
  if (url.pathname.startsWith('/api/login/')) return
  if (url.pathname === '/api/system/health') return
  if (url.pathname.startsWith('/api/no-adeudo/verify/')) return
  // External API routes are authenticated with their own service-token guard.
  // Do not require a browser session here, otherwise server-to-server requests
  // from SIPAE are rejected before the external token can be inspected.
  if (url.pathname.startsWith('/api/external/')) return

  event.context.auroraStage = 'auth_session'
  let user
  try {
    user = await getTrustedAuthUser(event)
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || error?.httpStatus || 500) || 500
    const diagnostic = error?.data?.diagnostic || error?.diagnostic || {
      requestId: String(event.context?.auroraRequestId || ''),
      code: String(error?.code || error?.data?.code || `AUTH_SESSION_HTTP_${status}`),
      source: 'auth_session',
      status,
      plantel: String(getCookie(event, 'auth_active_plantel') || ''),
      agentId: String(getCookie(event, 'db_bridge_agent_id') || ''),
      retryable: status >= 500,
      message: String(error?.message || 'No se pudo resolver la sesión.').replace(/\s+/g, ' ').trim().slice(0, 240)
    }
    throw createError({
      statusCode: status,
      statusMessage: status >= 500 ? 'Auth session failed' : undefined,
      message: diagnostic.message,
      data: { diagnostic }
    })
  }
  event.context.user = user
  event.context.auroraStage = 'authorization'

  const isControlEscolarEndpoint = url.pathname.startsWith('/api/control-escolar/')
  const isDirectoryEndpoint = url.pathname.startsWith('/api/directory/')
  const isExternalUsersEndpoint = url.pathname === '/api/users' || url.pathname.startsWith('/api/users/')
  const isProfileEndpoint = url.pathname === '/api/admin/profile'
  const isCentralMatriculaOverlayEndpoint =
    url.pathname === '/api/students/matricula-overlays' ||
    /^\/api\/students\/[^/]+\/matricula-overlay$/.test(url.pathname) ||
    /^\/api\/students\/[^/]+\/operator-info$/.test(url.pathname)


  if (isControlEscolarEndpoint) {
    if (!user.hasControlEscolarRole) {
      throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
    }
    return
  }

  if (
    isDirectoryEndpoint ||
    isExternalUsersEndpoint ||
    isProfileEndpoint ||
    isCentralMatriculaOverlayEndpoint
  ) {
    return
  }

  if (!user.hasFinancialAccess) {
    if (isNoAdeudoEndpoint) {
      return noAdeudoMiddlewareDiagnostic(event, {
        title: 'No tiene permisos para generar cartas de no adeudo.',
        detail: 'La sesión actual no tiene acceso financiero en este plantel y no puede ejecutar esta acción administrativa.',
        statusCode: 403,
        source: 'Middleware de autenticación',
        code: 'FORBIDDEN_CONTROL_ESCOLAR_ONLY',
        action: 'Inicia sesión con un usuario administrativo autorizado para generar cartas.'
      })
    }
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  const bridgeAgentId = resolveDataBridgeAgentId(event, user)

  if (bridgeAgentId && bridgeAgentId !== 'GLOBAL') {
    event.context.dbBridgeAgentId = bridgeAgentId
    event.context.auroraStage = 'bridge_context'
    enterBridgeAgentId(bridgeAgentId)
  } else if (getDbTransport() === 'bridge') {
    if (isNoAdeudoEndpoint) {
      return noAdeudoMiddlewareDiagnostic(event, {
        title: 'No se detectó plantel/agente de datos para preparar la carta.',
        detail: 'Aurora está en modo bridge y la sesión no tiene plantel de datos activo.',
        statusCode: 401,
        source: 'DB bridge',
        code: 'MISSING_DB_BRIDGE_AGENT',
        missing: ['plantel activo de sesión o DB_BRIDGE_AGENT_ID'],
        action: 'Vuelve a iniciar sesión con plantel activo o configura DB_BRIDGE_AGENT_ID si el servidor opera con un agente fijo.'
      })
    }
    throw createError({ statusCode: 401, message: 'Sesión sin plantel de datos para bridge mode.' })
  }

  if (url.pathname.startsWith('/api/admin/sql-console/')) {
    return
  }

  if (url.pathname.startsWith('/api/no-adeudo/')) {
    return
  }

  event.context.auroraStage = 'api_handler'
})
