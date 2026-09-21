import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresAdminSummary } from '../../../../utils/talleres-admin-summary'

/**
 * Exact external contract for Portal Tallerista.
 *
 * This intentionally calls the same summary builder used by the /alumnos
 * Talleres popup. The popup is the source-of-truth presentation: any official
 * Talleres consumer must see the same workshop/service identities and members.
 */
export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')

  const query = getQuery(event)
  return await readTalleresAdminSummary({
    event,
    plantel: query.plantel,
    ciclo: query.ciclo,
    includeStudents: true,
  })
})
