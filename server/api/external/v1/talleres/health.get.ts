import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotMeta } from '../../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
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
