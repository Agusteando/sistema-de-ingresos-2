import { resolveControlEscolarAuth, updateControlEscolarStudent } from '../../../utils/control-escolar'
import {
  scheduleStudentNameSync,
  studentNameFieldsInPatch,
  syncStudentNamePatchToBridgeBase,
} from '../../../utils/student-name-sync'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const matricula = String(event.context.params?.id || '').trim()
  const incoming = await readBody(event)
  const { groupMutation, ...body } = incoming || {}
  if (Object.prototype.hasOwnProperty.call(body, 'grupo') &&
      (!groupMutation || !['select','remove'].includes(groupMutation.action) ||
       typeof groupMutation.expectedGroup !== 'string' ||
       (String(body.grupo || '').trim() === '' && groupMutation.action !== 'remove'))) {
    throw createError({statusCode:409,message:'Selecciona el grupo de nuevo antes de guardar.',data:{requestId:event.context.auroraRequestId,code:'GROUP_SELECTION_REQUIRED'}})
  }

  try {
    const result = await updateControlEscolarStudent(auth.agentId, matricula, body, auth.user, {...queryParams, groupMutation:Object.prototype.hasOwnProperty.call(body,'grupo')?groupMutation:undefined, auditRequestId:event.context.auroraRequestId})
    const student: any = result?.student || null
    const changedNameFields = studentNameFieldsInPatch(body)

    if (changedNameFields.length) {
      const nameValues = Object.fromEntries(
        changedNameFields.map((field) => [
          field,
          student && Object.prototype.hasOwnProperty.call(student, field)
            ? student[field]
            : body?.[field],
        ]),
      )

      scheduleStudentNameSync(
        event,
        () => syncStudentNamePatchToBridgeBase({
          agentId: auth.agentId,
          matricula,
          fields: changedNameFields,
          values: nameValues,
        }),
        {
          direction: 'central-to-bridge',
          matricula,
          plantel: auth.agentId,
          fields: changedNameFields,
        },
      )
    }

    return result
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw createError({
      statusCode: error?.name === 'AbortError' ? 504 : 502,
      message: error?.message || 'No se pudo guardar la ficha de Control Escolar.'
    })
  }
})
