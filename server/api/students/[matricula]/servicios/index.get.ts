import { getTrustedAuthUser } from '../../../../utils/auth-session'
import { readCentralMatriculaServicios, resolveServiciosWithCatalog } from '../../../../utils/talleres-servicios'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  const matricula = getRouterParam(event, 'matricula')
  const current = await readCentralMatriculaServicios(matricula)
  const resolved = await resolveServiciosWithCatalog(current.servicios)
  return {
    ok: true,
    source: 'central',
    field: current.field,
    raw: current.raw,
    servicios: resolved.servicios,
    catalog: resolved.catalog.map((item) => ({
      clave: item.servicio_clave,
      nombre: item.servicio_nombre,
      imagen: item.imagen_url,
      activo: Number(item.activo || 0) !== 0,
      orden: Number(item.orden || 9999),
    })),
    catalogSource: resolved.catalogSource,
  }
})
