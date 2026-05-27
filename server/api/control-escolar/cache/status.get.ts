import { resolveControlEscolarAuth } from '../../../utils/control-escolar'
import { readControlCacheSourceMeta } from '../../../utils/control-escolar-cache'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const cache = await readControlCacheSourceMeta(auth.agentId)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { success: true, agentId: auth.agentId, cache }
})
