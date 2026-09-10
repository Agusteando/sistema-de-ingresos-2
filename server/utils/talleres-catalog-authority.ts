import { controlEscolarCentralQuery } from './control-escolar-central'
import { canonicalTallerKey, isFinalTaller, normalizeServicioNombre } from '../../shared/utils/talleresServicios'

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export const readAuthoritativeTalleresCatalog = async () => {
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT servicio_clave, servicio_nombre, imagen_url, IFNULL(activo, 1) AS activo, IFNULL(orden, 9999) AS orden,
            IFNULL(sync_version, 1) AS sync_version, updated_by
       FROM talleres_servicios_catalogo
      WHERE IFNULL(activo, 1) = 1
      ORDER BY IFNULL(orden, 9999) ASC, servicio_nombre ASC`
  )

  const byKey = new Map<string, any>()
  for (const row of rows) {
    const clave = canonicalTallerKey(row?.servicio_clave || row?.servicio_nombre)
    const nombre = normalizeServicioNombre(row?.servicio_nombre || clave)
    if (!clave || !nombre) continue
    const normalized = {
      servicio_clave: clave,
      servicio_nombre: nombre,
      imagen_url: clean(row?.imagen_url, 500),
      activo: 1,
      orden: Number(row?.orden || 9999),
      sync_version: Number(row?.sync_version || 1),
      updated_by: row?.updated_by || null,
      clave,
      nombre,
      imagen: clean(row?.imagen_url, 500),
      tipo: isFinalTaller(clave) ? 'taller' : 'servicio',
    }
    const current = byKey.get(clave)
    if (!current || normalized.orden < current.orden) byKey.set(clave, normalized)
  }

  return {
    source: 'central',
    catalog: Array.from(byKey.values()).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
  }
}
