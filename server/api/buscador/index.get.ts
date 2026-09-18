import { getTrustedAuthUser } from '../../utils/auth-session'
import { runWithBridgeAgentId } from '../../utils/db'
import { resolveBuscadorPlantel, searchBuscadorStudents } from '../../utils/buscador'

export default defineEventHandler(async (event) => {
  const user = event.context.user || await getTrustedAuthUser(event)
  const request = getQuery(event)
  const plantel = resolveBuscadorPlantel(user, request.plantel)

  return await runWithBridgeAgentId(plantel, async () => {
    return await searchBuscadorStudents(plantel, request.q || request.search, request.limit)
  })
})
