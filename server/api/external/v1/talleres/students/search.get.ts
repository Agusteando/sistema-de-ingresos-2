import { assertTalleresPortalAccess } from '../../../../../utils/talleres-portal-auth'
import { searchTalleresSnapshotStudents } from '../../../../../utils/talleres-snapshot'

/**
 * SNAPSHOT CONTRACT — PUBLIC API STAYS v1
 *
 * Search is executed against the same ready/current Talleres snapshot as roster.
 * Snapshots are a performance layer, not a stale-data fallback. If Aurora cannot
 * verify current snapshot data, this v1 endpoint fails rather than returning an
 * older cached student assignment.
 */
export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  return await searchTalleresSnapshotStudents(getQuery(event))
})
