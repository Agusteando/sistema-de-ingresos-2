import { requireConceptosStockAdmin, saveStockSettings } from '../../utils/conceptos-stock'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosStockAdmin(event)
  const body = await readBody(event)
  return await saveStockSettings(body, user)
})
