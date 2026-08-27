import {
  readCentralConceptos,
  readCentralConceptosConfig,
  requireConceptosAdmin,
  syncCentralConceptosCatalogToBridge,
  syncCentralConceptosConfigToBridge,
} from '../../../utils/conceptos-config'
import { readCentralTalleresServiciosCatalog, syncCentralTalleresServiciosCatalogToBridge } from '../../../utils/talleres-servicios'
import { resolveDataBridgeAgentId } from '../../../utils/auth-session'
import { getDbTransport, runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)

  if (getDbTransport() !== 'bridge') {
    return {
      ok: true,
      skipped: true,
      source: 'central',
      reason: 'direct_mode',
      message: 'La base activa ya es directa; no hay un Bridge local que actualizar.'
    }
  }

  const bridgeAgentId = resolveDataBridgeAgentId(event, user)
  if (!bridgeAgentId || bridgeAgentId === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel Bridge antes de actualizar conceptos.' })
  }

  // Read every authoritative source before entering the Bridge context. The
  // refresh is then a one-way central -> active Bridge operation.
  const [centralConfig, centralConceptos, serviciosCentral] = await Promise.all([
    readCentralConceptosConfig(),
    readCentralConceptos(),
    readCentralTalleresServiciosCatalog(),
  ])

  return await runWithBridgeAgentId(bridgeAgentId, async () => {
    const conceptos = await syncCentralConceptosCatalogToBridge(centralConceptos)
    const config = await syncCentralConceptosConfigToBridge(centralConfig)
    const servicios = await syncCentralTalleresServiciosCatalogToBridge(serviciosCentral.catalog)

    return {
      ok: true,
      bridgeAgentId,
      conceptos,
      config,
      servicios,
    }
  })
})
