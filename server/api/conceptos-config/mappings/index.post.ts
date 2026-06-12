import { createOrUpdateMapping, requireConceptosAdmin } from '../../../utils/conceptos-config'

export default defineEventHandler(async (event) => {
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  return await createOrUpdateMapping(body, user)
})
