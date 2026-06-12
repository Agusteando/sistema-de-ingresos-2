import { requireConceptosAdmin } from '../../../utils/conceptos-config'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { readBestTalleresServiciosCatalog, syncCentralTalleresServiciosCatalogToBridge } from '../../../utils/talleres-servicios'
import { normalizeServicioClave, normalizeServicioNombre } from '../../../../shared/utils/talleresServicios'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  const nombre = normalizeServicioNombre(body?.servicio_nombre || body?.servicio || body?.nombre)
  const clave = normalizeServicioClave(body?.servicio_clave || body?.clave || nombre)
  const imagen = String(body?.imagen_url || body?.imagen || (clave ? `/talleres-servicios/${clave}.svg` : '')).trim()
  const orden = Number(body?.orden || 9999)

  if (!clave || !nombre) throw createError({ statusCode: 400, message: 'Taller/servicio requerido.' })

  await controlEscolarCentralQuery(
    `INSERT INTO talleres_servicios_catalogo
       (servicio_clave, servicio_nombre, imagen_url, activo, orden, sync_version, updated_by)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       servicio_nombre = VALUES(servicio_nombre),
       imagen_url = VALUES(imagen_url),
       activo = 1,
       orden = VALUES(orden),
       sync_version = VALUES(sync_version),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [clave, nombre, imagen || `/talleres-servicios/${clave}.svg`, Number.isFinite(orden) ? orden : 9999, Date.now(), user.email]
  )

  let synced: any = { ok: false, skipped: true, reason: 'bridge_sync_unavailable' }
  try {
    const catalog = await readBestTalleresServiciosCatalog()
    synced = await syncCentralTalleresServiciosCatalogToBridge(catalog.catalog)
  } catch (error: any) {
    synced = { ok: false, skipped: true, reason: 'bridge_sync_unavailable', message: error?.message || String(error || '') }
  }

  return { ok: true, servicio: { clave, nombre, imagen: imagen || `/talleres-servicios/${clave}.svg` }, synced }
})
