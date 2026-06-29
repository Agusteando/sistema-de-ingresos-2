import { readCentralConceptos, readCentralConceptosConfig, buildConceptosConfigPayload, canManageConceptosConfig } from '../../utils/conceptos-config'
import { getTrustedAuthUser } from '../../utils/auth-session'
import { readBestTalleresServiciosCatalog } from '../../utils/talleres-servicios'
import { readBestStockSnapshots, readStockMovements, stockMapByConceptId, uncontrolledStockSnapshot } from '../../utils/conceptos-stock'
import { CONCEPTOS_PLANTELES_LIST, isConceptosPlantel, normalizeConceptosPlantel } from '../../../utils/constants'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const canManage = canManageConceptosConfig(user)
  const config = await readCentralConceptosConfig()
  const conceptos = await readCentralConceptos()
  const serviciosCatalogo = await readBestTalleresServiciosCatalog()
  const requestedPlantel = String(getQuery(event).plantel || '').trim().toUpperCase()
  const fallbackPlantel = String(user.active_plantel || event.context.dbBridgeAgentId || CONCEPTOS_PLANTELES_LIST[0]).toUpperCase()
  const activePlantel = requestedPlantel && requestedPlantel !== 'GLOBAL'
    ? normalizeConceptosPlantel(requestedPlantel)
    : normalizeConceptosPlantel(fallbackPlantel)
  const conceptoIds = conceptos.map((concepto: any) => Number(concepto.id || 0)).filter(Boolean)
  const stock = await readBestStockSnapshots({ conceptoIds })
  const visibleSnapshots = stock.snapshots.filter((snapshot: any) => isConceptosPlantel(String(snapshot.plantel || '')))
  const activeSnapshots = visibleSnapshots.filter((snapshot: any) => String(snapshot.plantel || '').toUpperCase() === activePlantel)
  const stockByConcept = stockMapByConceptId(activeSnapshots)
  const conceptosWithStock = conceptos.map((concepto: any) => {
    const conceptoId = Number(concepto.id || 0)
    return { ...concepto, stock: stockByConcept.get(conceptoId) || uncontrolledStockSnapshot(conceptoId, activePlantel, stock.source) }
  })
  const movements = await readStockMovements({ limit: 240 })
  const visibleMovements = (movements.movements || []).filter((movement: any) => isConceptosPlantel(String(movement.plantel || '')))

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
    stock: { source: stock.source, plantel: activePlantel, snapshots: activeSnapshots, allSnapshots: visibleSnapshots, movements: visibleMovements },
    serviciosCatalogo: serviciosCatalogo.catalog.map((item) => ({ clave: item.servicio_clave, nombre: item.servicio_nombre, imagen: item.imagen_url, activo: Number(item.activo || 0) !== 0, orden: Number(item.orden || 9999) })),
    serviciosCatalogoSource: serviciosCatalogo.source,
    ...buildConceptosConfigPayload({ ...config, conceptos: conceptosWithStock })
  }
})
