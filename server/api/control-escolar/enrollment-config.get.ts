import { readBestConceptosConfigPayload } from '../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')
  return await readBestConceptosConfigPayload()
})
