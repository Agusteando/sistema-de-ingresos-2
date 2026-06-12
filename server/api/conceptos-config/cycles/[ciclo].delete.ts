import { deleteCycle, requireConceptosAdmin } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  await requireConceptosAdmin(event)
  return await deleteCycle(getRouterParam(event, 'ciclo'))
})
