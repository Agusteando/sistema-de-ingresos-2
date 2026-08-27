import { getTrustedAuthUser } from '../../utils/auth-session'
import { readInstitutionalSchoolCycle } from '../../utils/school-cycle'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  const cycle = await readInstitutionalSchoolCycle()
  return {
    currentCycle: { key: cycle.key, label: cycle.label },
    schoolYears: cycle.schoolYears,
    source: cycle.source
  }
})
