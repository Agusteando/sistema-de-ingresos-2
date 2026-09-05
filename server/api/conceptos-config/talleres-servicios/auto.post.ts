import { requireConceptosAdmin } from '../../../utils/conceptos-config'
import { seedWorkshopFinancialMappings } from '../../../utils/conceptos-workshop-seed'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  return await seedWorkshopFinancialMappings(user, body?.ciclo)
})
