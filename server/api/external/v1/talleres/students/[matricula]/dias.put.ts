import { assertTalleresPortalAccess } from '../../../../../../utils/talleres-portal-auth'
import { saveTalleresStudentDays } from '../../../../../../utils/talleres-portal'

export default defineEventHandler(async (event) => {
  const user = await assertTalleresPortalAccess(event)
  const body = await readBody(event)
  return await saveTalleresStudentDays({
    matricula: getRouterParam(event, 'matricula'),
    plantel: body?.plantel,
    ciclo: body?.ciclo,
    servicio: body?.servicio,
    dias: body?.dias,
    updatedBy: user.email,
  })
})
