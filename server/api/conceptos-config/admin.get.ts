import { readCentralConceptos, readCentralConceptosConfig, buildConceptosConfigPayload, canManageConceptosConfig } from '../../utils/conceptos-config'
import { getTrustedAuthUser } from '../../utils/auth-session'
import { readBestTalleresServiciosCatalog } from '../../utils/talleres-servicios'
import { readBestStockSnapshots, readStockMovements, stockMapByConceptId, uncontrolledStockSnapshot } from '../../utils/conceptos-stock'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const canManage = canManageConceptosConfig(user)
  const config = await readCentralConceptosConfig()
  const conceptos = await readCentralConceptos()
  const serviciosCatalogo = await readBestTalleresServiciosCatalog()
  const requestedPlantel = String(getQuery(event).plantel || '').trim().toUpperCase()
  const fallbackPlantel = String(user.active_plantel || event.context.dbBridgeAgentId || 'PT').toUpperCase()
  const activePlantel = requestedPlantel && requestedPlantel !== 'GLOBAL'
    ? requestedPlantel
    : fallbackPlantel === 'GLOBAL' ? 'PT' : fallbackPlantel
  const stock = await readBestStockSnapshots({ plantel: activePlantel, conceptoIds: conceptos.map((concepto: any) => Number(concepto.id || 0)).filter(Boolean) })
  const stockByConcept = stockMapByConceptId(stock.snapshots)
  const conceptosWithStock = conceptos.map((concepto: any) => {
    const conceptoId = Number(concepto.id || 0)
    return { ...concepto, stock: stockByConcept.get(conceptoId) || uncontrolledStockSnapshot(conceptoId, activePlantel, stock.source) }
  })
  const movements = await readStockMovements({ plantel: activePlantel, limit: 80 })

  return {
    canManage,
    user: {
      email: user.email,
      role: user.role,
      roles: user.roles,
      isSuperAdmin: user.isSuperAdmin,
      activePlantel: user.active_plantel,
    },
    mappings: config.mappings,
    cycles: config.cycles,
    stock: { source: stock.source, plantel: activePlantel, snapshots: stock.snapshots, movements: movements.movements },
    serviciosCatalogo: serviciosCatalogo.catalog.map((item) => ({ clave: item.servicio_clave, nombre: item.servicio_nombre, imagen: item.imagen_url, activo: Number(item.activo || 0) !== 0, orden: Number(item.orden || 9999) })),
    serviciosCatalogoSource: serviciosCatalogo.source,
    ...buildConceptosConfigPayload({ ...config, conceptos: conceptosWithStock })
  }
})
