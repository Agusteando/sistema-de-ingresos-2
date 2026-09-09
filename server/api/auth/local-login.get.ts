import { normalizePlantel } from '../../utils/auth-session'
import { isLocalSystemRuntime } from '../../utils/local-system-manager'

const CANONICAL_CLOUD_URL = 'https://aurora.casitaiedis.edu.mx'
const LEGACY_CLOUD_HOSTS = new Set([
  'aurora.casitaapps.com'
])

const resolveCloudLoginBase = (value: unknown) => {
  const configured = new URL(String(value || CANONICAL_CLOUD_URL))
  if (!['http:', 'https:'].includes(configured.protocol)) {
    throw new Error('Unsupported Aurora cloud protocol.')
  }

  if (LEGACY_CLOUD_HOSTS.has(configured.hostname.toLowerCase())) {
    return new URL(CANONICAL_CLOUD_URL)
  }

  return configured
}

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
    cloudLogin = new URL('/login', resolveCloudLoginBase(config.localSystemCloudUrl))
  } catch {
    throw createError({ statusCode: 503, message: 'La dirección de Aurora En la nube no es válida.' })
  }

  cloudLogin.searchParams.set('handoff', 'local')
  cloudLogin.searchParams.set('plantel', localPlantel)
  return sendRedirect(event, cloudLogin.toString(), 302)
})