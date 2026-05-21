import { runWithBridgeAgentId } from '../../../utils/db'
import { fetchControlEscolarStudentDetail } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const agentId = event.context.dbBridgeAgentId || event.context.user?.active_plantel || event.context.user?.auth_home_plantel

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  if (!agentId || agentId === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel específico para consultar el expediente.' })
  }

  return await runWithBridgeAgentId(agentId, async () => fetchControlEscolarStudentDetail(String(agentId), String(matricula)))
})
