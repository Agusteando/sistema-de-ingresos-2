import { fetchControlEscolarStudentDetail, resolveControlEscolarAuth, runControlEscolar } from '../../../../utils/control-escolar'
import { readCentralMatriculaServicios, resolveServiciosWithCatalog } from '../../../../utils/talleres-servicios'
import { parseServiciosCsv } from '../../../../../shared/utils/talleresServicios'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')
  setResponseHeader(event, 'Vary', 'Cookie')
  const query = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, query.agentId)
  const matricula = String(event.context.params?.id || '').trim()

  return await runControlEscolar(event, auth.agentId, async () => {
    const student = await fetchControlEscolarStudentDetail(auth.agentId, matricula)
    const current = await readCentralMatriculaServicios(matricula)
    const fallbackRaw = (student as any).servicios || student.servicio || ''
    const serviceNames = current.servicios.length ? current.servicios : parseServiciosCsv(fallbackRaw)
    const resolved = await resolveServiciosWithCatalog(serviceNames)

    return {
      ok: true,
      source: 'central',
      field: current.field,
      raw: current.raw || fallbackRaw,
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
})
