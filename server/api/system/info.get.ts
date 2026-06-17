import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { LOCAL_SYSTEM_BRIDGE_COMMAND, localSystemDiagnosticSummary, unwrapLocalSystemBridgeResult } from '../../utils/local-system-handoff'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()
  const requestId = String(event.context?.auroraRequestId || '')

  if (!isLocalSystemRuntime()) {
    const user = event.context.user
    const activePlantel = normalizePlantel(user?.active_plantel)
    if (!activePlantel || activePlantel === 'GLOBAL') {
      return {
        ok: true,
        localSystem: false,
        mode: 'central',
        activePlantel,
        launchAvailable: false,
        launchUrl: '',
        code: 'LOCAL_SYSTEM_PLANTEL_REQUIRED',
        requestId,
        message: 'Selecciona un plantel para abrir Sistema Rápido.',
        localUrl: '',
        installed: null,
        available: null,
        updateAvailable: false
      }
    }

    if (getDbTransport() !== 'bridge') {
      return {
        ok: true,
        localSystem: false,
        mode: 'central',
        activePlantel,
        launchAvailable: false,
        launchUrl: '',
        code: 'LOCAL_SYSTEM_BRIDGE_REQUIRED',
        requestId,
        message: 'Sistema Rápido requiere el bridge del plantel.',
        localUrl: '',
        installed: null,
        available: null,
        updateAvailable: false
      }
    }

    try {
      const bridgeResponse = await runWithBridgeAgentId(activePlantel, () => runRawSqlStatement<unknown>(
        LOCAL_SYSTEM_BRIDGE_COMMAND,
        ['status', user?.email || '', activePlantel]
      ))
      const result = unwrapLocalSystemBridgeResult(bridgeResponse)
      const diagnostics = localSystemDiagnosticSummary(result)
      console.info(`[SistemaRapidoDiag] ${JSON.stringify({
        event: 'central_status',
        requestId,
        activePlantel,
        agentId: activePlantel,
        ...diagnostics,
        message: result?.message || ''
      })}`)

      return {
        ok: true,
        localSystem: false,
        mode: 'central',
        activePlantel,
        launchAvailable: Boolean(result?.ok && result?.available),
        launchUrl: result?.ok && result?.available
          ? `/api/system/launch?plantel=${encodeURIComponent(activePlantel)}`
          : '',
        code: result?.code || 'LOCAL_SYSTEM_STATUS_INVALID',
        requestId: result?.requestId || requestId,
        message: result?.message || 'El agente no devolvió un estado válido de Sistema Rápido.',
        localUrl: result?.localUrl || '',
        installed: result?.installedVersion || result?.installedSha
          ? { version: result?.installedVersion || '', sha: result?.installedSha || '' }
          : null,
        available: null,
        updateAvailable: false,
        diagnostics
      }
    } catch (error: any) {
      const code = String(error?.code || error?.data?.code || 'LOCAL_SYSTEM_STATUS_FAILED')
      const message = String(error?.data?.message || error?.message || 'No se pudo consultar Sistema Rápido en el agente.')
      console.error(`[SistemaRapidoDiag] ${JSON.stringify({
        event: 'central_status_error',
        requestId,
        activePlantel,
        agentId: activePlantel,
        code,
        status: Number(error?.statusCode || error?.status || 0) || null,
        message
      })}`)
      return {
        ok: true,
        localSystem: false,
        mode: 'central',
        activePlantel,
        launchAvailable: false,
        launchUrl: '',
        code,
        requestId,
        message,
        localUrl: '',
        installed: null,
        available: null,
        updateAvailable: false,
        diagnostics: { code, requestId, available: false, plantel: activePlantel }
      }
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
    code: status?.localAvailability?.code || '',
    requestId,
    installed: status.current || {
      sha: String(process.env.LOCAL_SYSTEM_BUILD_SHA || config.localSystemBuildSha || ''),
      version: String(process.env.LOCAL_SYSTEM_BUILD_VERSION || config.localSystemBuildVersion || ''),
      builtAt: String(process.env.LOCAL_SYSTEM_BUILD_DATE || config.localSystemBuildDate || '')
    },
    available: status.available || null,
    updateAvailable: Boolean(status.updateAvailable),
    operation: status.operation || null,
    localAvailability: status.localAvailability || null,
    diagnosticsLog: status.diagnosticsLog || '',
    lastUpdate: status.lastUpdate || null,
    checkError: status.checkError || ''
  }
})
