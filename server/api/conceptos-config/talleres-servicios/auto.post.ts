import { requireConceptosAdmin } from '../../../utils/conceptos-config'
import { seedWorkshopFinancialMappings } from '../../../utils/conceptos-workshop-seed'
import { ensureCurrentTalleresSnapshots } from '../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const result = await seedWorkshopFinancialMappings(user, body?.ciclo)
  const snapshotRefresh = await ensureCurrentTalleresSnapshots({ ciclo: result?.ciclo || body?.ciclo })
  return { ...result, snapshotRefresh }
})
