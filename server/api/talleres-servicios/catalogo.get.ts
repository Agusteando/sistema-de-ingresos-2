import { getTrustedAuthUser } from '../../utils/auth-session'
import { readBestTalleresServiciosCatalog } from '../../utils/talleres-servicios'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  const result = await readBestTalleresServiciosCatalog()
  return {
    ok: true,
    source: result.source,
    catalog: result.catalog.map((item) => ({
      clave: item.servicio_clave,
      nombre: item.servicio_nombre,
      imagen: item.imagen_url,
      activo: Number(item.activo || 0) !== 0,
      orden: Number(item.orden || 9999),
    }))
  }
})
