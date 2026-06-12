import { createOrUpdateMapping, requireConceptosAdmin } from '../../../utils/conceptos-config'
import { resolveDataBridgeAgentId } from '../../../utils/auth-session'
import { runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  const bridgeAgentId = resolveDataBridgeAgentId(event, user)

  return await runWithBridgeAgentId(bridgeAgentId, async () => await createOrUpdateMapping({
    ...body,
    tipo: 'talleres_servicios',
    concepto_id: 0,
    concepto_nombre: body?.servicio_nombre || body?.servicio || 'Taller sin concepto',
  }, user))
})
