import { query, runWithBridgeAgentId } from '../../../utils/db'
import { plantelCandidatesForProjectedScope } from '../../../../shared/utils/grado'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { resolveControlEscolarAuth, updateControlEscolarStudent } from '../../../utils/control-escolar'
import { StudentRestoreError } from '../../../utils/student-status-restore'
import { restoreAuroraStudentBaja } from '../../../utils/student-baja-restore'

export default defineEventHandler(async (event) => {
  const params = getQuery(event)
  const fromControlEscolar = String(params.source || '') === 'control-escolar'
  const controlAuth = fromControlEscolar
    ? await resolveControlEscolarAuth(event, params.agentId)
    : null
  const user = controlAuth?.user || event.context.user
  const matricula = String(event.context.params?.matricula || '').trim()
  const bridgeAgentId = controlAuth?.agentId || event.context.dbBridgeAgentId

  return runWithBridgeAgentId(bridgeAgentId, async () => {
    const globalSuperAdmin = !fromControlEscolar && user?.isSuperAdmin && user?.active_plantel === 'GLOBAL'
    const allowedPlanteles = globalSuperAdmin
      ? null
      : plantelCandidatesForProjectedScope(controlAuth?.agentId || user?.active_plantel)
    let studentPlantel = controlAuth?.agentId || (
      user?.active_plantel !== 'GLOBAL' ? String(user?.active_plantel || '') : ''
    )
    try {
      const result = await restoreAuroraStudentBaja({
        matricula,
        planteles: allowedPlanteles,
        requireBase: !fromControlEscolar,
        queryBase: async (sql, values) => {
          const rows = await query(sql, values)
          if (sql.startsWith('SELECT matricula, plantel, estatus') && rows?.[0]?.plantel) {
            studentPlantel = String(rows[0].plantel).trim()
          }
          return rows
        },
        queryCentral: (sql, values) => controlEscolarCentralQuery(sql, values),
        updateCentral: async (studentKey, patch) => {
          if (!studentPlantel || studentPlantel === 'GLOBAL') {
            throw new StudentRestoreError(409, 'No se pudo verificar el plantel del alumno.')
          }
          await updateControlEscolarStudent(studentPlantel, studentKey, patch, user)
        },
        onCompensationFailure: (error) => {
          console.error('[students.restore] central-compensation-failed', {
            matricula, plantel: studentPlantel, error: String((error as Error)?.message || error),
          })
        },
      })
      console.info('[students.restore]', {
        matricula,
        plantel: studentPlantel,
        actor: user?.email || '',
        source: fromControlEscolar ? 'control-escolar' : 'alumnos',
        restoredBase: result.restoredBase,
        restoredCentral: result.restoredCentral,
        alreadyActive: result.alreadyActive,
      })
      return result
    } catch (error) {
      if (error instanceof StudentRestoreError) {
        throw createError({ statusCode: error.statusCode, message: error.message })
      }
      throw error
    }
  })
})
