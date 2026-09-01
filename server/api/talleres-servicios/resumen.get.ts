import { getTrustedAuthUser, normalizePlantel } from '../../utils/auth-session'
import { readTalleresAdminSummary } from '../../utils/talleres-admin-summary'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const query = getQuery(event)
  const plantel = normalizePlantel(query.plantel || user.active_plantel)

  if (!plantel || !user.plantelesList.includes(plantel)) {
    throw createError({ statusCode: 403, message: 'No tiene acceso a Talleres en este plantel.' })
  }
  if (!user.isSuperAdmin && !user.financialPlantelesList.includes(plantel)) {
    throw createError({ statusCode: 403, message: 'No tiene acceso a Talleres en este plantel.' })
  }
  if (plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para consultar Talleres.' })
  }

  return await readTalleresAdminSummary({
    event,
    plantel,
    ciclo: query.ciclo,
  })
})
