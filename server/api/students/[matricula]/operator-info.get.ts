import { runWithBridgeAgentId } from '../../../utils/db'
import { getTrustedAuthUser } from '../../../utils/auth-session'
import { fetchControlEscolarStudentDetail } from '../../../utils/control-escolar'

const resolveOperatorInfoAccess = async (event: any) => {
  const user = event.context.user || await getTrustedAuthUser(event)

  if (user.isControlEscolarOnly) {
    throw createError({ statusCode: 403, message: 'La información ampliada de alumno es una vista de operadores y no está disponible para Control Escolar.' })
  }

  return user
}

export default defineEventHandler(async (event) => {
  const user = await resolveOperatorInfoAccess(event)
  const matricula = event.context.params?.matricula
  const agentId = event.context.dbBridgeAgentId || user.active_plantel || user.auth_home_plantel

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  if (!agentId || agentId === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel específico para consultar la información del alumno.' })
  }

  return await runWithBridgeAgentId(String(agentId), async () => fetchControlEscolarStudentDetail(String(agentId), String(matricula)))
})
