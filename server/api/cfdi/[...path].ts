import { runWithBridgeAgentId } from '../../utils/db'
import { proxyCfdiEvent, resolveCfdiPath } from '../../utils/cfdi-proxy'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  return proxyCfdiEvent(event, resolveCfdiPath(event.context.params?.path))
}))
