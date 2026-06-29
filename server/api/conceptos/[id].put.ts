import { requireConceptosAdmin, updateCentralConceptImage } from '../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const id = event.context.params?.id
  const body = await readBody(event)
  return await updateCentralConceptImage(id, body?.image_url ?? body?.imagen_url ?? body?.imagen ?? '', user)
})
