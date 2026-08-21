import { assertTalleresPortalAccess } from '../../../../../../utils/talleres-portal-auth'
import { mutateTalleresStudentWorkshop } from '../../../../../../utils/talleres-portal'

export default defineEventHandler(async (event) => {
  const user = await assertTalleresPortalAccess(event)
  const body = await readBody(event)
  const action = String(body?.action || '').toLowerCase() as 'add' | 'remove'
  return await mutateTalleresStudentWorkshop({
    matricula: getRouterParam(event, 'matricula'),
    plantel: body?.plantel,
    ciclo: body?.ciclo,
    servicio: body?.servicio,
    action,
    eventual: body?.eventual,
    notas: body?.notas,
    updatedBy: user.email,
  })
})
