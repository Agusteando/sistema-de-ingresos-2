export const LOCAL_SYSTEM_BRIDGE_COMMAND_V1 = '/* CASITA_SISTEMA_RAPIDO_V1 */ SELECT ? AS operation, ? AS email, ? AS plantel'
export const LOCAL_SYSTEM_BRIDGE_COMMAND_V2 = '/* CASITA_SISTEMA_RAPIDO_V2 */ SELECT ? AS __casita_local_system_operation, ? AS __casita_local_system_email, ? AS __casita_local_system_plantel'

// The deployed bridge agent currently implements V1. Keep V2 as a fallback so
// Aurora can negotiate either protocol without requiring an agent update.
export const LOCAL_SYSTEM_BRIDGE_COMMAND = LOCAL_SYSTEM_BRIDGE_COMMAND_V1

export type LocalSystemBridgeProtocol = 'v1' | 'v2'
export type LocalSystemBridgeOperation = 'status' | 'launch'

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
  availableVersion?: string
  availableSha?: string
  updateAvailable?: boolean
  autoUpdateEnabled?: boolean
  autoUpdateTriggered?: boolean
  autoUpdateReason?: string
  operation?: { phase?: string; running?: boolean; message?: string; error?: string; source?: string; requestId?: string } | null
  checkError?: string
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
    updateAvailable?: boolean
    availableVersion?: string
    availableSha?: string
    autoUpdateEnabled?: boolean
    autoUpdateTriggered?: boolean
    autoUpdateReason?: string
    checkError?: string
    protocol?: LocalSystemBridgeProtocol
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
  message: 'El agente del plantel no reconoció este protocolo de acceso local.',
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
      // Do not classify the first row before checking whether it is an explicit
      // intercepted response. V1 agents commonly return their response as a
      // one-row array and may include operation/email/plantel in that row.
      current = current[0] || null
      continue
    }

    const object = objectValue(current)
    if (!object) return null

    // A real intercepted response is authoritative whenever the agent returns
    // `ok` plus response metadata. V1 launch responses may legitimately echo
    // operation/email/plantel, so checking for a SQL echo first can discard a
    // valid one-time launchUrl as "command not intercepted". The raw SQL echo
    // never contains `ok`, therefore accepting explicit responses first is safe.
    if (typeof object.ok === 'boolean' && (
      'available' in object
      || 'launchUrl' in object
      || 'expiresAt' in object
      || 'localUrl' in object
      || 'diagnostics' in object
      || 'code' in object
      || 'operation' in object
      || 'accepted' in object
      || 'installedVersion' in object
      || 'installedSha' in object
    )) {
      return object as LocalSystemBridgeResult
    }

    const echo = commandEcho(object)
    if (echo) return unsupportedAgentResult(echo)

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

export type CompatibleLocalSystemBridgeExecution = {
  raw: unknown
  result: LocalSystemBridgeResult | null
  protocol: LocalSystemBridgeProtocol
}

export const runCompatibleLocalSystemBridgeCommand = async (
  execute: (sql: string, params: [LocalSystemBridgeOperation, string, string]) => Promise<unknown>,
  operation: LocalSystemBridgeOperation,
  email: string,
  plantel: string,
): Promise<CompatibleLocalSystemBridgeExecution> => {
  const params: [LocalSystemBridgeOperation, string, string] = [
    operation,
    String(email || '').trim().toLowerCase(),
    String(plantel || '').trim().toUpperCase(),
  ]
  const protocols: Array<{ protocol: LocalSystemBridgeProtocol; command: string }> = [
    { protocol: 'v1', command: LOCAL_SYSTEM_BRIDGE_COMMAND_V1 },
    { protocol: 'v2', command: LOCAL_SYSTEM_BRIDGE_COMMAND_V2 },
  ]

  let last: CompatibleLocalSystemBridgeExecution | null = null
  for (const candidate of protocols) {
    const raw = await execute(candidate.command, params)
    const result = unwrapLocalSystemBridgeResult(raw)
    last = { raw, result, protocol: candidate.protocol }
    if (result?.code !== 'LOCAL_SYSTEM_AGENT_COMMAND_NOT_INTERCEPTED') {
      if (result?.diagnostics) result.diagnostics.protocol = candidate.protocol
      return last
    }
  }

  return last || { raw: null, result: null, protocol: 'v1' }
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
  responseShape: String(result?.diagnostics?.responseShape || ''),
  updateAvailable: Boolean(result?.updateAvailable ?? result?.diagnostics?.updateAvailable),
  availableVersion: String(result?.availableVersion || result?.diagnostics?.availableVersion || ''),
  availableSha: String(result?.availableSha || result?.diagnostics?.availableSha || ''),
  autoUpdateEnabled: Boolean(result?.autoUpdateEnabled ?? result?.diagnostics?.autoUpdateEnabled),
  autoUpdateTriggered: Boolean(result?.autoUpdateTriggered ?? result?.diagnostics?.autoUpdateTriggered),
  autoUpdateReason: String(result?.autoUpdateReason || result?.diagnostics?.autoUpdateReason || ''),
  checkError: String(result?.checkError || result?.diagnostics?.checkError || ''),
  protocol: result?.diagnostics?.protocol || ''
})
