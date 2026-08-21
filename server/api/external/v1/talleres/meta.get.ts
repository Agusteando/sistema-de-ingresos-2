import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresPortalMeta } from '../../../../utils/talleres-portal'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  const query = getQuery(event)
  return await readTalleresPortalMeta(query.ciclo)
})
