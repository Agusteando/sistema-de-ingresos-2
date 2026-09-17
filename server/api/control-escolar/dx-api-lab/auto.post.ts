import { runDxPlantelAutoDx } from '../../../utils/dx-api-lab'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await runDxPlantelAutoDx(event, body)
})
