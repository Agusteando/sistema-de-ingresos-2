import { createHash } from 'node:crypto'
import { getDbTransport } from './db'
import { isLocalSystemRuntime } from './local-system-manager'
import {
  readCentralConceptos,
  readCentralConceptosConfig,
  syncCentralConceptosCatalogToBridge,
  syncCentralConceptosConfigToBridge,
} from './conceptos-config'

// Single-flight and bounded retries prevent concurrent campus requests from
// writing the same snapshot. A failed refresh never removes local concepts.
const INTERVAL_MS = 5 * 60 * 1000
let lastAttempt = 0
let lastDigest = ''
let inFlight: Promise<void> | null = null

export const refreshLocalConceptMirror = (force = false): Promise<void> => {
  if (!isLocalSystemRuntime() || getDbTransport() !== 'direct') return Promise.resolve()
  if (inFlight) return inFlight
  if (!force && Date.now() - lastAttempt < INTERVAL_MS) return Promise.resolve()
  lastAttempt = Date.now()
  inFlight = (async () => {
    const [conceptos, config] = await Promise.all([readCentralConceptos(), readCentralConceptosConfig()])
    if (!Array.isArray(conceptos) || !conceptos.length) {
      throw new Error('Central concepts returned an empty catalog; preserving local copy.')
    }
    const digest = createHash('sha256').update(JSON.stringify({ conceptos, config })).digest('hex')
    if (digest === lastDigest) return
    await syncCentralConceptosCatalogToBridge(conceptos)
    await syncCentralConceptosConfigToBridge(config)
    lastDigest = digest
    console.info('[AuroraLocalConceptMirror]', JSON.stringify({ status: 'synced', count: conceptos.length }))
  })().catch((error) => {
    lastAttempt = Date.now() - INTERVAL_MS + 30000
    console.warn('[AuroraLocalConceptMirror]', JSON.stringify({ status: 'refresh-failed', message: String(error?.message || error) }))
    throw error
  }).finally(() => { inFlight = null })
  return inFlight
}
