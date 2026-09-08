import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotMeta } from '../../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  const query = getQuery(event)
  return await readTalleresSnapshotMeta(query.ciclo)
})
