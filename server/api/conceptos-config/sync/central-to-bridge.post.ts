import { requireConceptosAdmin, syncCentralConceptosConfigToBridge } from '../../../utils/conceptos-config'
import { readCentralTalleresServiciosCatalog, syncCentralTalleresServiciosCatalogToBridge } from '../../../utils/talleres-servicios'
import { resolveDataBridgeAgentId } from '../../../utils/auth-session'
import { runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const bridgeAgentId = resolveDataBridgeAgentId(event, user)

  return await runWithBridgeAgentId(bridgeAgentId, async () => {
    const conceptos = await syncCentralConceptosConfigToBridge()
    const serviciosCentral = await readCentralTalleresServiciosCatalog()
    const servicios = await syncCentralTalleresServiciosCatalogToBridge(serviciosCentral.catalog)
    return { ok: true, conceptos, servicios }
  })
})
