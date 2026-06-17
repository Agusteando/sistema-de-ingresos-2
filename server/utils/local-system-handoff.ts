export const LOCAL_SYSTEM_BRIDGE_COMMAND = '/* CASITA_SISTEMA_RAPIDO_V1 */ SELECT ? AS operation, ? AS email, ? AS plantel'

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
  }
}

export const unwrapLocalSystemBridgeResult = (value: unknown): LocalSystemBridgeResult | null => {
  let current: any = value

  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) return (current[0] || null) as LocalSystemBridgeResult | null
    if (!current || typeof current !== 'object') return null
    if (typeof current.ok === 'boolean' && ('available' in current || 'launchUrl' in current || 'diagnostics' in current || 'code' in current)) {
      return current as LocalSystemBridgeResult
    }
    if (Array.isArray(current.rows)) return (current.rows[0] || null) as LocalSystemBridgeResult | null
    if (current.result !== undefined) {
      current = current.result
      continue
    }
    if (current.data !== undefined) {
      current = current.data
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
  operationError: String(result?.diagnostics?.operationError || '')
})
