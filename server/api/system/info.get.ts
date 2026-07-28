import { getDbTransport, runRawSqlStatement, runWithBridgeAgentId } from '../../utils/db'
import { normalizePlantel } from '../../utils/auth-session'
import { localSystemDiagnosticSummary, runCompatibleLocalSystemBridgeCommand } from '../../utils/local-system-handoff'
import { bridgeAgentMatchesPlantel, localSystemPlantelEligibility } from '../../utils/local-system-eligibility'
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
        updateEligible: false,
        launchUrl: '',
        code: 'LOCAL_SYSTEM_PLANTEL_REQUIRED',
        requestId,
        message: 'Selecciona un plantel para abrir en este equipo.',
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
        updateEligible: false,
        launchUrl: '',
        code: 'LOCAL_SYSTEM_BRIDGE_REQUIRED',
        requestId,
        message: 'Este equipo requiere el agente del plantel.',
        localUrl: '',
        installed: null,
        available: null,
        updateAvailable: false
      }
    }

    try {
      const { result, protocol } = await runCompatibleLocalSystemBridgeCommand(
        (sql, params) => runWithBridgeAgentId(activePlantel, () => runRawSqlStatement<unknown>(sql, params)),
        'status',
        user?.email || '',
        activePlantel,
      )
      const diagnostics = { ...localSystemDiagnosticSummary(result), protocol }
      const agentMatchesPlantel = bridgeAgentMatchesPlantel(result, activePlantel)
      const launchAvailable = Boolean(agentMatchesPlantel && result?.ok && result?.available)
      const operation = result?.operation || (diagnostics.phase || diagnostics.running || diagnostics.operationError
        ? {
            phase: diagnostics.phase,
            running: diagnostics.running,
            message: result?.message || '',
            error: diagnostics.operationError
          }
        : null)
      // The deployed V1 agent can create a handoff only when a local Aurora
      // release is already active. Initial installation remains the manager's
      // automatic responsibility; do not expose a manual action that cannot run.
      const updateEligible = launchAvailable
      console.info(`[SistemaRapidoDiag] ${JSON.stringify({
        event: 'central_status',
        requestId,
        activePlantel,
        agentId: activePlantel,
        agentMatchesPlantel,
        updateEligible,
        ...diagnostics,
        message: result?.message || ''
      })}`)

      return {
        ok: true,
        localSystem: false,
        mode: 'central',
        activePlantel,
        launchAvailable,
        updateEligible,
        launchUrl: launchAvailable
          ? `/api/system/launch?plantel=${encodeURIComponent(activePlantel)}`
          : '',
        code: result?.code || 'LOCAL_SYSTEM_STATUS_INVALID',
        requestId: result?.requestId || requestId,
        message: result?.message || 'El agente no devolvió un estado válido.',
        localUrl: result?.localUrl || '',
        installed: result?.installedVersion || result?.installedSha
          ? { version: result?.installedVersion || '', sha: result?.installedSha || '' }
          : null,
        available: result?.availableVersion || result?.availableSha
          ? { version: result?.availableVersion || '', sha: result?.availableSha || '' }
          : null,
        updateAvailable: Boolean(result?.updateAvailable),
        autoUpdateEnabled: result?.autoUpdateEnabled === true,
        autoUpdateTriggered: Boolean(result?.autoUpdateTriggered),
        autoUpdateReason: result?.autoUpdateReason || '',
        operation,
        checkError: result?.checkError || '',
        diagnostics
      }
    } catch (error: any) {
      const code = String(error?.code || error?.data?.code || 'LOCAL_SYSTEM_STATUS_FAILED')
      const message = String(error?.data?.message || error?.message || 'No se pudo consultar el agente del plantel.')
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
        updateEligible: false,
        launchUrl: '',
        code,
        requestId,
        message,
        localUrl: '',
        installed: null,
        available: null,
        updateAvailable: false,
        autoUpdateEnabled: false,
        autoUpdateTriggered: false,
        autoUpdateReason: 'status-error',
        operation: null,
        checkError: message,
        diagnostics: { code, requestId, available: false, plantel: activePlantel }
      }
    }
  }

  const eligibility = localSystemPlantelEligibility(event)
  if (!eligibility.eligible) {
    return {
      ok: true,
      localSystem: true,
      mode: 'direct',
      activePlantel: eligibility.activePlantel,
      localPlantel: eligibility.localPlantel || String(process.env.LOCAL_SYSTEM_PLANTEL || process.env.AGENT_ID || config.localSystemPlantel || ''),
      launchAvailable: false,
      updateEligible: false,
      launchUrl: '',
      code: 'LOCAL_SYSTEM_AGENT_MISMATCH',
      requestId,
      installed: null,
      available: null,
      updateAvailable: false,
      operation: null,
      checkError: ''
    }
  }

  const status = await requestLocalSystemManager<any>('/status')
  return {
    ok: true,
    localSystem: true,
    mode: 'direct',
    activePlantel: eligibility.activePlantel,
    localPlantel: eligibility.localPlantel,
    launchAvailable: false,
    updateEligible: true,
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
    autoUpdateEnabled: status.autoUpdateEnabled === true,
    autoUpdateTriggered: Boolean(status.autoUpdateTriggered),
    autoUpdateReason: String(status.autoUpdateReason || ''),
    operation: status.operation || null,
    localAvailability: status.localAvailability || null,
    diagnosticsLog: status.diagnosticsLog || '',
    lastUpdate: status.lastUpdate || null,
    checkError: status.checkError || ''
  }
})
