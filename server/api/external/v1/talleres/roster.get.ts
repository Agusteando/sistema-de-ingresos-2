import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresPortalRoster } from '../../../../utils/talleres-portal'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  return await readTalleresPortalRoster(event, getQuery(event))
})
