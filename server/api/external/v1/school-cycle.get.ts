import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../utils/external-api-auth'
import { readInstitutionalSchoolCycle } from '../../../utils/school-cycle'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 60)
  const cycle = await readInstitutionalSchoolCycle()
  return {
    currentCycle: { key: cycle.key, label: cycle.label },
    schoolYears: cycle.schoolYears,
    source: cycle.source
  }
})
