import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotRoster } from '../../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  return await readTalleresSnapshotRoster(getQuery(event))
})
