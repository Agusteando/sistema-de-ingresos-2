import { assertTalleresPortalAccess } from '../../../../../../utils/talleres-portal-auth'
import { refreshTalleresSnapshotPlantel, saveTalleresSnapshotStudentDays } from '../../../../../../utils/talleres-snapshot'

const refreshAfterWrite = async (plantel: string, ciclo: string) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const result: any = await refreshTalleresSnapshotPlantel({ plantel, ciclo, force: true })
      if (result?.reason !== 'refresh_in_progress') return result
    } catch (error: any) {
      return { success: false, message: String(error?.message || 'No se pudo refrescar el snapshot.').slice(0, 500) }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return { success: true, skipped: true, reason: 'refresh_still_in_progress' }
}

export default defineEventHandler(async (event) => {
  const user = await assertTalleresPortalAccess(event)
  const body = await readBody(event)
  const result = await saveTalleresSnapshotStudentDays({
    matricula: getRouterParam(event, 'matricula'),
    plantel: body?.plantel,
    ciclo: body?.ciclo,
    servicio: body?.servicio,
    dias: body?.dias,
    updatedBy: user.email,
  })
  return { ...result, snapshotRefresh: await refreshAfterWrite(result.plantel, result.ciclo) }
})
