import { runWithBridgeAgentId } from '../../utils/db'
import { proxyCfdiCompatEvent } from '../../utils/cfdi-compat'
import { resolveCfdiPath } from '../../utils/cfdi-proxy'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  return proxyCfdiCompatEvent(event, resolveCfdiPath(event.context.params?.path))
}))
