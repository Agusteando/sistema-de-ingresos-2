import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, type LocalSystemBridgeResult, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()

  if (!isLocalSystemRuntime()) {
    const user = event.context.user
    const activePlantel = normalizePlantel(user?.active_plantel)
    let discovery: LocalSystemBridgeResult | null = null

    if (activePlantel && activePlantel !== 'GLOBAL' && getDbTransport() === 'bridge') {
      try {
        const bridgeResponse = await runWithBridgeAgentId(activePlantel, () => runRawSqlStatement<unknown>(
          LOCAL_SYSTEM_BRIDGE_COMMAND,
          ['status', user?.email || '', activePlantel]
        ))
        discovery = unwrapLocalSystemBridgeResult(bridgeResponse)
      } catch {}
    }

    return {
      ok: true,
      localSystem: false,
      mode: 'central',
      activePlantel,
      launchAvailable: Boolean(discovery?.ok && discovery?.available),
      launchUrl: discovery?.ok && discovery?.available
        ? `/api/system/launch?plantel=${encodeURIComponent(activePlantel)}`
        : '',
      message: discovery?.message || (discovery?.ok
        ? 'Sistema Rápido todavía no está disponible en este plantel.'
        : 'No se pudo verificar Sistema Rápido mediante Bridge.'),
      localUrl: discovery?.localUrl || '',
      installed: discovery?.installedSha
        ? { sha: discovery.installedSha, version: discovery.installedVersion || '' }
        : null,
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
