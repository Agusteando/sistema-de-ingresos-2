import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotMeta } from '../../../../utils/talleres-snapshot'

/**
 * SNAPSHOT CONTRACT — PUBLIC API STAYS v1
 *
 * Health reports the state of the same precomputed v1 snapshot layer used by
 * roster/search. Snapshot view identifiers are internal implementation details.
 * The snapshot exists for fast reads and must be refreshed when source data
 * changes; consumers must never be moved to /v2 or /v3 because storage changes.
 */
export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const meta: any = await readTalleresSnapshotMeta(getQuery(event)?.ciclo)
  const sources = Array.isArray(meta?.snapshot?.sources) ? meta.snapshot.sources : []
  const ready = sources.filter((source: any) => source?.ready).length
  return {
    status: ready === sources.length ? 'ok' : (ready > 0 ? 'degraded' : 'unavailable'),
    source: meta.source,
    ciclo: meta.ciclo,
    viewVersion: meta?.snapshot?.viewVersion || null,
    planteles: sources,
    ready,
    expected: sources.length,
  }
})
