import { getDbTransport, query, runWithBridgeAgentId } from '../../../utils/db'
import { plantelCandidatesForProjectedScope } from '../../../../shared/utils/grado'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { resolveControlEscolarAuth, updateControlEscolarStudent } from '../../../utils/control-escolar'
import { StudentRestoreError, restoreStudentActiveStatus } from '../../../utils/student-status-restore'
import { restoreAuroraStudentBaja } from '../../../utils/student-baja-restore'
import { isLocalSystemRuntime } from '../../../utils/local-system-manager'
import { isCentralTransportFailure, queueLocalStudentRestore, clearQueuedStudentRestore } from '../../../utils/local-student-restore-outbox'

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
    let centralReadFailed = false
    try {
      const result = await restoreAuroraStudentBaja({
        matricula,
        planteles: allowedPlanteles,
        requireBase: !fromControlEscolar,
        queryBase: async (sql, values) => {
          const rows = await query<any>(sql, values)
          if (sql.startsWith('SELECT matricula, plantel, estatus') && rows?.[0]?.plantel) {
            studentPlantel = String(rows[0].plantel).trim()
          }
          return rows
        },
        queryCentral: async (sql, values) => {
          try { return await controlEscolarCentralQuery<any[]>(sql, values) }
          catch (error) { centralReadFailed = true; throw error }
        },
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
      if (isLocalSystemRuntime() && studentPlantel && studentPlantel !== 'GLOBAL') {
        await clearQueuedStudentRestore(matricula, studentPlantel).catch((error) => console.warn('[students.restore] outbox-cleanup-failed', error))
      }
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
      // Only a failed central READ can trigger offline fallback. An ambiguous
      // central WRITE must not be retried as a separate local operation.
      if (centralReadFailed && isLocalSystemRuntime() && getDbTransport() === 'direct' && isCentralTransportFailure(error)) {
        const scoped = allowedPlanteles !== null
        if (scoped && !allowedPlanteles.length) throw createError({ statusCode: 403, message: 'Plantel no autorizado.' })
        const localRows = await query<any[]>(
          `SELECT matricula, plantel, estatus FROM base WHERE matricula = ?${scoped ? ` AND plantel IN (${allowedPlanteles!.map(() => '?').join(',')})` : ''} LIMIT 1`,
          [matricula, ...(allowedPlanteles || [])]
        )
        const local = localRows[0]
        if (!local?.plantel || !String(local.estatus || '').trim()) {
          throw createError({ statusCode: 503, message: 'No existe una baja local verificable para restaurar sin conexión central.' })
        }
        const campus = String(local.plantel).trim().toUpperCase()
        // Persist the intent first: a restart between the local write and
        // central reconciliation must never silently drop this request.
        const queued = await queueLocalStudentRestore({ matricula, plantel: campus, actor: String(user?.email || '') })
        try {
          const localResult = await restoreStudentActiveStatus(matricula, allowedPlanteles, (sql, values) => query<any>(sql, values))
          console.info('[students.restore]', { event: 'offline-pending', matricula, plantel: campus, restoredBase: !localResult.alreadyActive, pendingCentral: true })
          return {
            success: true, alreadyActive: false, estatus: 'Activo',
            restoredBase: !localResult.alreadyActive, restoredCentral: false, pendingCentral: true,
            message: 'La baja se restauró localmente. El cambio central se sincronizará cuando vuelva la conexión.'
          }
        } catch (localError) {
          if (queued.created) await clearQueuedStudentRestore(matricula, campus).catch((cleanupError) => console.error('[students.restore] outbox-cleanup-failed', cleanupError))
          throw localError
        }
      }
      if (error instanceof StudentRestoreError) {
        throw createError({ statusCode: error.statusCode, message: error.message })
      }
      throw error
    }
  })
})
