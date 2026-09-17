import { runDxApiRequest } from '../../../utils/dx-api-lab'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return await runDxApiRequest(event, await readBody(event))
})
