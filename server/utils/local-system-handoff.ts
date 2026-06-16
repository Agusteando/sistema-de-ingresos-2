export const LOCAL_SYSTEM_BRIDGE_COMMAND = '/* CASITA_SISTEMA_RAPIDO_V1 */ SELECT ? AS operation, ? AS email, ? AS plantel'

export type LocalSystemBridgeResult = {
  ok: boolean
  available?: boolean
  plantel?: string
  localUrl?: string
  launchUrl?: string
  expiresAt?: string
  installedVersion?: string
  installedSha?: string
  message?: string
}


export const unwrapLocalSystemBridgeResult = (value: unknown): LocalSystemBridgeResult | null => {
  let current: any = value

  for (let depth = 0; depth < 4; depth += 1) {
    if (Array.isArray(current)) return (current[0] || null) as LocalSystemBridgeResult | null
    if (!current || typeof current !== 'object') return null
    if (typeof current.ok === 'boolean') return current as LocalSystemBridgeResult
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
