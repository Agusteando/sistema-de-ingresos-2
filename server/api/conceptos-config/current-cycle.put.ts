import { requireConceptosAdmin, saveCycle } from '../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  return await saveCycle(body?.ciclo || body?.cycle_name, true, user)
})
