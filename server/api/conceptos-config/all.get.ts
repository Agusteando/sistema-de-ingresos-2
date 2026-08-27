import { readBestConceptosConfigPayload } from '../../utils/conceptos-config'
import { readBestTalleresServiciosCatalog, readFinalTalleresCatalog } from '../../utils/talleres-servicios'

export default defineEventHandler(async () => {
  const payload = await readBestConceptosConfigPayload()
  const [servicios, talleres] = await Promise.all([
    readBestTalleresServiciosCatalog(),
    readFinalTalleresCatalog(),
  ])
  return {
    ...payload,
    serviciosCatalogo: servicios.catalog.map((item) => ({
      clave: item.servicio_clave,
      nombre: item.servicio_nombre,
      imagen: item.imagen_url,
      activo: Number(item.activo || 0) !== 0,
      orden: Number(item.orden || 9999),
    })),
    serviciosCatalogoSource: servicios.source,
    talleresCatalogo: talleres.catalog.map((item) => ({
      clave: item.servicio_clave,
      nombre: item.servicio_nombre,
      imagen: item.imagen_url,
      activo: true,
      orden: Number(item.orden || 9999),
    })),
    talleresCatalogoSource: talleres.source,
  }
})
