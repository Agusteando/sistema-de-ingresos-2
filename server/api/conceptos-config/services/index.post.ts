import { createOrUpdateMapping, requireConceptosAdmin } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  return await createOrUpdateMapping({
    ...body,
    tipo: 'talleres_servicios',
    concepto_id: 0,
    concepto_nombre: body?.servicio_nombre || body?.servicio || 'Taller sin concepto',
  }, user)
})
