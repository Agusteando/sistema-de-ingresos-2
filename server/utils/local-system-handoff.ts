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
