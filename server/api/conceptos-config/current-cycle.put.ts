import { requireConceptosAdmin, saveCycle } from '../../utils/conceptos-config'
import { resolveDataBridgeAgentId } from '../../utils/auth-session'
import { runWithBridgeAgentId } from '../../utils/db'
import { ensureCurrentTalleresSnapshots } from '../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  const bridgeAgentId = resolveDataBridgeAgentId(event, user)

  const result = await runWithBridgeAgentId(bridgeAgentId, async () => await saveCycle(body?.ciclo || body?.cycle_name, true, user))
  const snapshotRefresh = await ensureCurrentTalleresSnapshots({ ciclo: result?.ciclo || body?.ciclo || body?.cycle_name })
  return { ...result, snapshotRefresh }
})
