import { buildConceptConfigResponse } from '../../utils/conceptos-config'
import { runWithBridgeAgentId } from '../../utils/db'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')
  const { source = 'local' } = getQuery(event)
  const normalizedSource = String(source) === 'central' ? 'central' : 'local'
  return await buildConceptConfigResponse(normalizedSource)
}))
