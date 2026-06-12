import { requireConceptosAdmin, syncCentralConceptosConfigToBridge } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  await requireConceptosAdmin(event)
  return await syncCentralConceptosConfigToBridge()
})
