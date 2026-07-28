import { localSystemPlantelEligibility } from '../../utils/local-system-eligibility'
import { requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const eligibility = localSystemPlantelEligibility(event)

  // Do not even query the updater when this local installation belongs to a
  // different plantel than the active session. Some managers may use status
  // checks to start automatic work.
  if (!eligibility.eligible) {
    return {
      ok: true,
      activePlantel: eligibility.activePlantel,
      localPlantel: eligibility.localPlantel,
      updateEligible: false,
      updateAvailable: false,
      operation: null,
      checkError: ''
    }
  }

  const query = getQuery(event)
  const status = await requestLocalSystemManager<any>('/status', {
    refresh: String(query.refresh || '') === '1'
  })

  return {
    ...status,
    activePlantel: eligibility.activePlantel,
    localPlantel: eligibility.localPlantel,
    updateEligible: true
  }
})
