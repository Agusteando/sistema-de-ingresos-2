import { resolveControlEscolarAuth, runControlEscolar, updateControlEscolarStudent } from '../../../utils/control-escolar'
import { logControlEscolarAuditEvent } from '../../../utils/control-escolar-audit'

const cleanFieldName = (value: unknown) => String(value || '').trim().slice(0, 80)
const editableFieldNames = (body: any) => Object.keys(body || {})
  .filter((key) => !['id', 'matricula', 'agentId', 'ciclo', 'cicloKey', 'targetCiclo', 'concepts', 'enrollmentConcepts'].includes(key))
  .map(cleanFieldName)
  .filter(Boolean)
  .slice(0, 40)

const completionFromStudent = (student: any) => {
  if (String(student?.enrollmentState || '').toLowerCase() !== 'inscrito') return null
  const basic = student?.completenessTiers?.basic
  if (basic && Number.isFinite(Number(basic.progress))) return Number(basic.progress)
  const missing = Array.isArray(student?.missingFields) ? student.missingFields.length : 0
  const total = Math.max(1, Number(basic?.total || 9))
  return Math.max(0, Math.min(100, Math.round(((total - Math.min(total, missing)) / total) * 100)))
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const matricula = String(event.context.params?.id || '').trim()
  const body = await readBody(event)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const result = await updateControlEscolarStudent(auth.agentId, matricula, body, auth.user, queryParams)
      const fields = editableFieldNames(body)
      const progressPercent = completionFromStudent(result?.student)
      logControlEscolarAuditEvent({
        eventType: 'student_update',
        plantel: auth.agentId,
        ciclo: String(queryParams.ciclo || queryParams.cicloKey || queryParams.targetCiclo || ''),
        matricula,
        user: auth.user,
        summary: `Actualizó ${fields.length || 1} campo${fields.length === 1 ? '' : 's'} de ${matricula}`,
        progress: {
          percent: progressPercent,
          total: 1,
          completed: progressPercent === 100 ? 1 : 0,
          pending: progressPercent === 100 ? 0 : 1,
        },
        source: {
          base: result?.student?.sourceBase || result?.student?.baseSource || '',
          flow: 'student_patch_matricula_overlay',
        },
        payload: {
          fields,
          missingFields: result?.student?.missingFields || [],
          missingLabels: result?.student?.missingLabels || [],
          completenessTiers: result?.student?.completenessTiers || null,
          overlayExists: Boolean(result?.student?.overlayExists),
          enrollmentState: result?.student?.enrollmentState || '',
        },
      }).catch((error: any) => {
        console.warn('[Control Escolar Audit] Student update audit skipped', error?.message || error)
      })
      return result
    } catch (error: any) {
      if (error?.statusCode) throw error
      throw createError({
        statusCode: error?.name === 'AbortError' ? 504 : 502,
        message: error?.message || 'No se pudo guardar la ficha de Control Escolar.'
      })
    }
  })
})
