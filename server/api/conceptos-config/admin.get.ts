import { readCentralConceptos, readCentralConceptosConfig, buildConceptosConfigPayload, canManageConceptosConfig } from '../../utils/conceptos-config'
import { getTrustedAuthUser } from '../../utils/auth-session'
import { readBestTalleresServiciosCatalog } from '../../utils/talleres-servicios'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const canManage = canManageConceptosConfig(user)
  const config = await readCentralConceptosConfig()
  const conceptos = await readCentralConceptos()
  const serviciosCatalogo = await readBestTalleresServiciosCatalog()

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
    serviciosCatalogo: serviciosCatalogo.catalog.map((item) => ({ clave: item.servicio_clave, nombre: item.servicio_nombre, imagen: item.imagen_url, activo: Number(item.activo || 0) !== 0, orden: Number(item.orden || 9999) })),
    serviciosCatalogoSource: serviciosCatalogo.source,
    ...buildConceptosConfigPayload({ ...config, conceptos })
  }
})
