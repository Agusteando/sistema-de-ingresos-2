import { normalizePlantel } from '../../utils/auth-session'
import { isLocalSystemRuntime } from '../../utils/local-system-manager'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  if (!isLocalSystemRuntime()) {
    throw createError({ statusCode: 404, message: 'Esta ruta solo está disponible en Aurora Local.' })
  }

  const config = useRuntimeConfig()
  const localPlantel = normalizePlantel(
    process.env.LOCAL_SYSTEM_PLANTEL ||
    process.env.AGENT_ID ||
    config.localSystemPlantel
  )

  if (!localPlantel || localPlantel === 'GLOBAL') {
    throw createError({ statusCode: 503, message: 'Aurora Local no tiene un plantel configurado.' })
  }

  let cloudLogin: URL
  try {
    cloudLogin = new URL('/login', String(config.localSystemCloudUrl || 'https://aurora.casitaiedis.edu.mx'))
  } catch {
    throw createError({ statusCode: 503, message: 'La dirección de Aurora En la nube no es válida.' })
  }

  cloudLogin.searchParams.set('handoff', 'local')
  cloudLogin.searchParams.set('plantel', localPlantel)
  return sendRedirect(event, cloudLogin.toString(), 302)
})
