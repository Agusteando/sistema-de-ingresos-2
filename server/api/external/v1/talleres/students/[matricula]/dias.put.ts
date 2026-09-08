import { assertTalleresPortalAccess } from '../../../../../../utils/talleres-portal-auth'
import { saveTalleresSnapshotStudentDays } from '../../../../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  const user = await assertTalleresPortalAccess(event)
  const body = await readBody(event)
  return await saveTalleresSnapshotStudentDays({
    matricula: getRouterParam(event, 'matricula'),
    plantel: body?.plantel,
    ciclo: body?.ciclo,
    servicio: body?.servicio,
    dias: body?.dias,
    updatedBy: user.email,
  })
})
