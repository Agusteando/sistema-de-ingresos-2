import { requireConceptosAdmin } from '../../../utils/conceptos-config'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { readAuthoritativeTalleresCatalog } from '../../../utils/talleres-catalog-authority'
import { syncCentralTalleresServiciosCatalogToBridge } from '../../../utils/talleres-servicios'
import { normalizeServicioClave, normalizeServicioNombre } from '../../../../shared/utils/talleresServicios'
import { refreshTalleresAfterCommittedConfigWrite } from '../../../utils/talleres-snapshot'

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
     AS mysql97_new ON DUPLICATE KEY UPDATE
       servicio_nombre = mysql97_new.servicio_nombre,
       imagen_url = mysql97_new.imagen_url,
       activo = 1,
       orden = mysql97_new.orden,
       sync_version = mysql97_new.sync_version,
       updated_by = mysql97_new.updated_by,
       updated_at = CURRENT_TIMESTAMP`,
    [clave, nombre, imagen || `/talleres-servicios/${clave}.svg`, Number.isFinite(orden) ? orden : 9999, Date.now(), user.email]
  )

  let synced: any = { ok: false, skipped: true, reason: 'bridge_sync_unavailable' }
  try {
    const catalog = await readAuthoritativeTalleresCatalog()
    synced = await syncCentralTalleresServiciosCatalogToBridge(catalog.catalog)
  } catch (error: any) {
    synced = { ok: false, skipped: true, reason: 'bridge_sync_unavailable', message: error?.message || String(error || '') }
  }

  // The central write is committed. Campus roster verification must never
  // turn that into a misleading HTTP failure; stale rosters remain invalidated.
  const snapshotRefresh = await refreshTalleresAfterCommittedConfigWrite({ operation: 'catalog_upsert' })
  return { ok: true, servicio: { clave, nombre, imagen: imagen || `/talleres-servicios/${clave}.svg` }, synced, snapshotRefresh }
})
