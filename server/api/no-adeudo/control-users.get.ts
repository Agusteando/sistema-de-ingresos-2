import { listExternalControlUsersForNoAdeudo, getNoAdeudoControlUserForPlantel, noAdeudoControlUsersColumnExists, NO_ADEUDO_CONTROL_PLANTELES_COLUMN } from '../../utils/external-users'
import { normalizePlantel } from '../../utils/auth-session'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, message: 'Sesión requerida.' })
  }

  const query = getQuery(event)
  const plantel = normalizePlantel(query.plantel)
  const [users, selected, hasAssignmentColumn] = await Promise.all([
    listExternalControlUsersForNoAdeudo(query.q || query.search || ''),
    plantel ? getNoAdeudoControlUserForPlantel(plantel) : Promise.resolve(null),
    noAdeudoControlUsersColumnExists()
  ])

  return {
    ok: true,
    plantel,
    users,
    selected,
    schema: {
      assignmentColumn: NO_ADEUDO_CONTROL_PLANTELES_COLUMN,
      assignmentColumnReady: hasAssignmentColumn
    }
  }
})
