import { resolveControlEscolarAuth, runControlEscolar, updateControlEscolarHuskyPass } from '../../../../utils/control-escolar'
import { logControlEscolarAuditEvent } from '../../../../utils/control-escolar-audit'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const matricula = String(event.context.params?.id || '').trim()
  const body = await readBody(event).catch(() => ({}))

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const result = await updateControlEscolarHuskyPass(auth.agentId, matricula, body)
      const student: any = result.student || {}
      logControlEscolarAuditEvent({
        eventType: 'student_update',
        plantel: auth.agentId,
        ciclo: String(queryParams.ciclo || queryParams.cicloKey || queryParams.targetCiclo || ''),
        matricula,
        user: auth.user,
        summary: `${result.action === 'manual' ? 'Cambió' : result.action === 'regenerate' ? 'Regeneró' : 'Generó'} contraseña Husky Pass de ${matricula}`,
        progress: {
          percent: student.huskyPassAvailable ? 100 : 0,
          total: 1,
          completed: student.huskyPassAvailable ? 1 : 0,
          pending: student.huskyPassAvailable ? 0 : 1,
        },
        source: {
          base: student.sourceBase || student.baseSource || '',
          flow: 'husky_pass_users_write',
        },
        payload: {
          action: result.action,
          huskyPassAvailable: Boolean(student.huskyPassAvailable),
          username: student.huskyPassUsername || '',
        },
      }).catch((error: any) => {
        console.warn('[Control Escolar Audit] Husky Pass update audit skipped', error?.message || error)
      })
      return result
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: error?.name === 'AbortError' ? 504 : 502,
        message: error?.message || 'No se pudo actualizar Husky Pass.'
      })
    }
  })
})
