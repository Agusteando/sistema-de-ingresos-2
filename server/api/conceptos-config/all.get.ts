import { readBestConceptosConfigPayload } from '../../utils/conceptos-config'

export default defineEventHandler(async () => {
  return await readBestConceptosConfigPayload()
})
