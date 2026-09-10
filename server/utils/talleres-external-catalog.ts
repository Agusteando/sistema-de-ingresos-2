import { canonicalTallerKey, isFinalTaller, normalizeServicioNombre } from '../../shared/utils/talleresServicios'
import { readBestTalleresServiciosCatalog } from './talleres-servicios'

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export const readCompleteTalleresExternalCatalog = async () => {
  const source = await readBestTalleresServiciosCatalog()
  const byKey = new Map<string, any>()

  for (const row of source.catalog || []) {
    const clave = canonicalTallerKey(row?.servicio_clave || row?.servicio_nombre)
    const nombre = normalizeServicioNombre(row?.servicio_nombre || clave)
    if (!clave || !nombre || Number(row?.activo ?? 1) === 0) continue

    const item = {
      clave,
      nombre,
      imagen: clean(row?.imagen_url, 500),
      activo: true,
      orden: Number(row?.orden || 9999),
      tipo: isFinalTaller(clave) ? 'taller' : 'servicio',
    }
    const current = byKey.get(clave)
    if (!current || item.orden < Number(current?.orden || 9999)) byKey.set(clave, item)
  }

  const catalog = Array.from(byKey.values())
    .sort((a, b) => Number(a.orden || 9999) - Number(b.orden || 9999) || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    source: source.source,
    catalog,
    talleres: catalog.filter((item) => item.tipo === 'taller'),
    servicios: catalog.filter((item) => item.tipo === 'servicio'),
  }
}
