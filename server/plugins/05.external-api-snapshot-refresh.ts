import { runExternalControlEscolarSnapshotRefreshPass } from '../utils/control-escolar-external-snapshot-refresh'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

const enabled = () => {
  const value = String(process.env.AURORA_EXTERNAL_SNAPSHOT_REFRESH_ENABLED || 'true').trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(value)
}

export default defineNitroPlugin(() => {
  if (!enabled() || process.env.NODE_ENV === 'test') return

  const run = async () => {
    const startedAt = Date.now()
    try {
      const result = await runExternalControlEscolarSnapshotRefreshPass()
      if (result?.skipped) {
        console.info('[external-api-snapshot] refresh skipped', {
          reason: result.reason,
          ciclo: result.ciclo || null
        })
        return
      }

      console.info('[external-api-snapshot] refresh pass complete', {
        ciclo: result?.ciclo || null,
        dueScopes: Number(result?.dueScopes || 0),
        refreshedScopes: Number(result?.refreshedScopes || 0),
        failedScopes: Number(result?.failedScopes || 0),
        durationMs: Date.now() - startedAt
      })
    } catch (error: any) {
      console.error('[external-api-snapshot] refresh pass failed', {
        code: String(error?.code || error?.statusMessage || ''),
        message: String(error?.message || 'No se pudo refrescar el snapshot externo.').slice(0, 500),
        durationMs: Date.now() - startedAt
      })
    }
  }

  const startupDelayMs = 2_000 + Math.floor(Math.random() * 6_000)
  const startupTimer = setTimeout(() => void run(), startupDelayMs)
  ;(startupTimer as any).unref?.()

  const interval = setInterval(() => void run(), CHECK_INTERVAL_MS)
  ;(interval as any).unref?.()
})
