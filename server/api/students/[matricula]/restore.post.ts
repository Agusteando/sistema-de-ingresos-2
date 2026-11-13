import { query, runWithBridgeAgentId } from '../../../utils/db'
import { plantelCandidatesForProjectedScope } from '../../../../shared/utils/grado'
import { StudentRestoreError, restoreStudentActiveStatus } from '../../../utils/student-status-restore'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const globalSuperAdmin = user?.isSuperAdmin && user?.active_plantel === 'GLOBAL'
  const allowedPlanteles = globalSuperAdmin ? null : plantelCandidatesForProjectedScope(user?.active_plantel)

  try {
    const result = await restoreStudentActiveStatus(
      String(event.context.params?.matricula || ''),
      allowedPlanteles,
      query,
    )
    console.info('[students.restore]', {
      matricula: String(event.context.params?.matricula || ''),
      plantel: user?.active_plantel || '',
      actor: user?.email || '',
      alreadyActive: result.alreadyActive,
    })
    return result
  } catch (error) {
    if (error instanceof StudentRestoreError) {
      throw createError({ statusCode: error.statusCode, message: error.message })
    }
    throw error
  }
}))
