import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotRoster } from '../../../../utils/talleres-snapshot'

/**
 * SNAPSHOT CONTRACT — PUBLIC API STAYS v1
 *
 * The snapshot exists only so this endpoint can return a ready payload quickly.
 * It must reflect the latest Aurora-managed catalogue/assignment state. A known
 * old snapshot is synchronously refreshed before this handler returns; if a
 * current snapshot cannot be verified, the request fails instead of serving
 * stale data. Internal snapshot versions never create a public /v2 or /v3.
 */
export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  return await readTalleresSnapshotRoster(getQuery(event))
})
