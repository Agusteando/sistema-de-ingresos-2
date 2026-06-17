export const LOCAL_SYSTEM_BRIDGE_COMMAND = '/* CASITA_SISTEMA_RAPIDO_V2 */ SELECT ? AS __casita_local_system_operation, ? AS __casita_local_system_email, ? AS __casita_local_system_plantel'

export type LocalSystemHealthSummary = {
  ok?: boolean
  code?: string
  statusCode?: number | null
  ms?: number
  message?: string
  mysql?: { ok?: boolean; database?: string | null; latencyMs?: number; error?: string | null } | null
  central?: { ok?: boolean; database?: string | null; latencyMs?: number; error?: string | null } | null
}

export type LocalSystemBridgeResult = {
  ok: boolean
  available?: boolean
  code?: string
  requestId?: string
  plantel?: string
  localUrl?: string
  launchUrl?: string
  expiresAt?: string
  installedVersion?: string
  installedSha?: string
  message?: string
  diagnostics?: {
    operation?: string
    selectedAddress?: string
    addressCandidates?: string[]
    entryExists?: boolean
    health?: LocalSystemHealthSummary | null
    recoveryAttempted?: boolean
    recoveryError?: string
    phase?: string
    running?: boolean
    operationError?: string
    lastUpdate?: unknown
    agentCommandIntercepted?: boolean
    echoedOperation?: string
    echoedPlantel?: string
    responseShape?: string
  }
}

const objectValue = (value: any): Record<string, any> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : null
)

const compact = (value: unknown, max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

const commandEcho = (value: any) => {
  const object = objectValue(value)
  if (!object) return null
  const operation = compact(
    object.__casita_local_system_operation ??
    object.operation
  ).toLowerCase()
  const plantel = compact(
    object.__casita_local_system_plantel ??
    object.plantel
  ).toUpperCase()
  const email = compact(
    object.__casita_local_system_email ??
    object.email
  ).toLowerCase()
  const hasV2Sentinel = Object.prototype.hasOwnProperty.call(object, '__casita_local_system_operation')
  const hasLegacyEcho = ['status', 'launch'].includes(operation) && Boolean(plantel) && Object.prototype.hasOwnProperty.call(object, 'email')
  if (!hasV2Sentinel && !hasLegacyEcho) return null
  return { operation, plantel, email, shape: hasV2Sentinel ? 'v2_sql_echo' : 'v1_sql_echo' }
}

const unsupportedAgentResult = (echo: ReturnType<typeof commandEcho>): LocalSystemBridgeResult => ({
  ok: false,
  available: false,
  code: 'LOCAL_SYSTEM_AGENT_COMMAND_NOT_INTERCEPTED',
  plantel: echo?.plantel || '',
  message: 'El agente Bridge ejecutó el comando de Sistema Rápido como SQL normal. Actualiza o reinicia el proceso db-bridge-agent del plantel; el manager local puede estar sano, pero el proceso principal no tiene activo el contrato de handoff.',
  diagnostics: {
    operation: echo?.operation || '',
    agentCommandIntercepted: false,
    echoedOperation: echo?.operation || '',
    echoedPlantel: echo?.plantel || '',
    responseShape: echo?.shape || 'sql_echo'
  }
})

export const unwrapLocalSystemBridgeResult = (value: unknown): LocalSystemBridgeResult | null => {
  let current: any = value

  for (let depth = 0; depth < 7; depth += 1) {
    if (Array.isArray(current)) {
      const first = current[0] || null
      const echo = commandEcho(first)
      if (echo) return unsupportedAgentResult(echo)
      current = first
      continue
    }

    const object = objectValue(current)
    if (!object) return null

    const echo = commandEcho(object)
    if (echo) return unsupportedAgentResult(echo)

    if (typeof object.ok === 'boolean' && ('available' in object || 'launchUrl' in object || 'diagnostics' in object || 'code' in object)) {
      return object as LocalSystemBridgeResult
    }

    if (Array.isArray(object.rows)) {
      current = object.rows
      continue
    }
    if (object.result !== undefined) {
      current = object.result
      continue
    }
    if (object.data !== undefined) {
      current = object.data
      continue
    }
    if (object.payload !== undefined) {
      current = object.payload
      continue
    }
    if (object.response !== undefined) {
      current = object.response
      continue
    }
    return null
  }

  return null
}

export const localSystemDiagnosticSummary = (result: LocalSystemBridgeResult | null) => ({
  code: String(result?.code || 'LOCAL_SYSTEM_UNKNOWN'),
  requestId: String(result?.requestId || ''),
  available: Boolean(result?.available),
  plantel: String(result?.plantel || ''),
  installedVersion: String(result?.installedVersion || ''),
  installedSha: String(result?.installedSha || ''),
  selectedAddress: String(result?.diagnostics?.selectedAddress || ''),
  entryExists: Boolean(result?.diagnostics?.entryExists),
  phase: String(result?.diagnostics?.phase || ''),
  running: Boolean(result?.diagnostics?.running),
  recoveryAttempted: Boolean(result?.diagnostics?.recoveryAttempted),
  recoveryError: String(result?.diagnostics?.recoveryError || ''),
  health: result?.diagnostics?.health || null,
  operationError: String(result?.diagnostics?.operationError || ''),
  agentCommandIntercepted: result?.diagnostics?.agentCommandIntercepted !== false,
  echoedOperation: String(result?.diagnostics?.echoedOperation || ''),
  echoedPlantel: String(result?.diagnostics?.echoedPlantel || ''),
  responseShape: String(result?.diagnostics?.responseShape || '')
})
