import { getTrustedAuthUser } from '../../utils/auth-session'
import { runWithBridgeAgentId } from '../../utils/db'
import { getBuscadorStudentProfile, resolveBuscadorPlantel } from '../../utils/buscador'

export default defineEventHandler(async (event) => {
  const user = event.context.user || await getTrustedAuthUser(event)
  const request = getQuery(event)
  const plantel = resolveBuscadorPlantel(user, request.plantel)
  const matricula = getRouterParam(event, 'matricula')

  return await runWithBridgeAgentId(plantel, async () => {
    return await getBuscadorStudentProfile(plantel, matricula)
  })
})
