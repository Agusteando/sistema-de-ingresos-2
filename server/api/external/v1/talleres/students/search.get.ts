import { assertTalleresPortalAccess } from '../../../../../utils/talleres-portal-auth'
import { searchTalleresSnapshotStudents } from '../../../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  return await searchTalleresSnapshotStudents(getQuery(event))
})
