import { requireConceptosAdmin } from '../../../utils/conceptos-config'
import { seedWorkshopFinancialMappings } from '../../../utils/conceptos-workshop-seed'

// TEMPORARY 2026-2027 operational endpoint. Remove it after the one-time seed
// is confirmed in production; see docs/temporary-workshop-concept-seed-2026-2027.md.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const user = await requireConceptosAdmin(event)
  return await seedWorkshopFinancialMappings(user)
})
