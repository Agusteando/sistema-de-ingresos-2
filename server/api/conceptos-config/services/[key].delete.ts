import { requireConceptosAdmin } from '../../../utils/conceptos-config'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { readAuthoritativeTalleresCatalog } from '../../../utils/talleres-catalog-authority'
import { syncCentralTalleresServiciosCatalogToBridge } from '../../../utils/talleres-servicios'
import { canonicalTallerKey } from '../../../../shared/utils/talleresServicios'

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const requestedKey = canonicalTallerKey(getRouterParam(event, 'key'))
  if (!requestedKey) throw createError({ statusCode: 400, message: 'Taller requerido.' })

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT servicio_clave, servicio_nombre
       FROM talleres_servicios_catalogo
      WHERE IFNULL(activo, 1) = 1`
  )
  const matches = rows.filter((row) => canonicalTallerKey(row?.servicio_clave || row?.servicio_nombre) === requestedKey)
  if (!matches.length) throw createError({ statusCode: 404, message: 'Ese taller ya no está activo.' })

  const rawKeys = Array.from(new Set(matches.map((row) => clean(row?.servicio_clave, 120).toUpperCase()).filter(Boolean)))
  for (const rawKey of rawKeys) {
    await controlEscolarCentralQuery(
      `UPDATE talleres_servicios_catalogo
          SET activo = 0, sync_version = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE UPPER(TRIM(servicio_clave)) = ?`,
      [Date.now(), user.email, rawKey]
    )
  }

  if (rawKeys.length) {
    await controlEscolarCentralQuery(
      `UPDATE config_enrollment_mappings
          SET activo = 0, updated_at = CURRENT_TIMESTAMP
        WHERE IFNULL(enrollment_type, 'regular') = 'talleres_servicios'
          AND UPPER(TRIM(servicio_clave)) IN (${rawKeys.map(() => '?').join(',')})`,
      rawKeys
    )
  }

  const authoritative = await readAuthoritativeTalleresCatalog()
  let synced: any = { ok: false, skipped: true, reason: 'bridge_sync_unavailable' }
  try {
    synced = await syncCentralTalleresServiciosCatalogToBridge(authoritative.catalog)
  } catch (error: any) {
    synced = { ok: false, skipped: true, reason: 'bridge_sync_unavailable', message: clean(error?.message, 500) }
  }

  return {
    ok: true,
    removed: { clave: requestedKey, nombre: clean(matches[0]?.servicio_nombre, 180) || requestedKey },
    mappingsDisabled: true,
    catalog: authoritative.catalog,
    synced,
  }
})
