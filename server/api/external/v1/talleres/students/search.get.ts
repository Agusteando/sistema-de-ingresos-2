import { assertTalleresPortalAccess } from '../../../../../utils/talleres-portal-auth'
import { searchTalleresPortalStudents } from '../../../../../utils/talleres-portal'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  return await searchTalleresPortalStudents(event, getQuery(event))
})
