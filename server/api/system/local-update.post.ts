import { assertLocalSystemPlantelEligibility } from '../../utils/local-system-eligibility'
import { requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  assertLocalSystemPlantelEligibility(event)
  return await requestLocalSystemManager('/update', { method: 'POST' })
})
