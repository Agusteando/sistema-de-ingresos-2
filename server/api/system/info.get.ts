import { normalizePlantel } from '../../utils/auth-session'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()

  if (!isLocalSystemRuntime()) {
    const user = event.context.user
    const activePlantel = normalizePlantel(user?.active_plantel)
    const launchAvailable = Boolean(activePlantel && activePlantel !== 'GLOBAL')

    return {
      ok: true,
      localSystem: false,
      mode: 'central',
      activePlantel,
      launchAvailable,
      launchUrl: launchAvailable
        ? `/api/system/launch?plantel=${encodeURIComponent(activePlantel)}`
        : '',
      message: launchAvailable
        ? 'Selecciona para abrir Sistema Rápido.'
        : 'Selecciona un plantel para abrir Sistema Rápido.',
      localUrl: '',
      installed: null,
      available: null,
      updateAvailable: false
    }
  }

  const status = await requestLocalSystemManager<any>('/status')
  return {
    ok: true,
    localSystem: true,
    mode: 'direct',
    activePlantel: String(process.env.LOCAL_SYSTEM_PLANTEL || process.env.AGENT_ID || config.localSystemPlantel || ''),
    launchAvailable: false,
    launchUrl: '',
    installed: status.current || {
      sha: String(process.env.LOCAL_SYSTEM_BUILD_SHA || config.localSystemBuildSha || ''),
      version: String(process.env.LOCAL_SYSTEM_BUILD_VERSION || config.localSystemBuildVersion || ''),
      builtAt: String(process.env.LOCAL_SYSTEM_BUILD_DATE || config.localSystemBuildDate || '')
    },
    available: status.available || null,
    updateAvailable: Boolean(status.updateAvailable),
    operation: status.operation || null,
    lastUpdate: status.lastUpdate || null,
    checkError: status.checkError || ''
  }
})
