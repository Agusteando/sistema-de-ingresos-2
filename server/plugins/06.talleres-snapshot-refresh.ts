import { getDbTransport } from '../utils/db'
import { refreshTalleresSnapshots } from '../utils/talleres-snapshot'

/**
 * Safety-net refresh only.
 *
 * Snapshot correctness must NOT depend on this timer. Aurora-managed mutations
 * refresh affected snapshots synchronously before their current state is exposed,
 * and snapshot readers synchronously refresh known-old payloads. This interval
 * only catches out-of-band database changes or missed external writes.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000

const enabled = () => {
  const value = String(process.env.AURORA_TALLERES_SNAPSHOT_REFRESH_ENABLED || 'true').trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(value)
}

export default defineNitroPlugin(() => {
  if (!enabled() || process.env.NODE_ENV === 'test' || getDbTransport() !== 'bridge') return

  const run = async () => {
    const startedAt = Date.now()
    try {
      const result = await refreshTalleresSnapshots()
      console.info('[talleres-snapshot] refresh pass complete', {
        ciclo: result?.ciclo || null,
        refreshed: Number(result?.refreshed || 0),
        failures: Array.isArray(result?.failures) ? result.failures.length : 0,
        durationMs: Date.now() - startedAt,
      })
    } catch (error: any) {
      console.error('[talleres-snapshot] refresh pass failed', {
        code: String(error?.code || error?.statusMessage || ''),
        message: String(error?.message || 'No se pudo refrescar el snapshot de Talleres.').slice(0, 500),
        durationMs: Date.now() - startedAt,
      })
    }
  }

  const startupDelayMs = 8_000 + Math.floor(Math.random() * 4_000)
  const startupTimer = setTimeout(() => void run(), startupDelayMs)
  ;(startupTimer as any).unref?.()

  const interval = setInterval(() => void run(), CHECK_INTERVAL_MS)
  ;(interval as any).unref?.()
})
