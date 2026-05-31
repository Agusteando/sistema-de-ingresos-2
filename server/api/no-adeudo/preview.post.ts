import { runWithBridgeAgentId } from '../../utils/db'
import { buildNoAdeudoPreviewPayload } from '../../utils/noAdeudo'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const matriculas = Array.isArray(body?.matriculas)
    ? body.matriculas
    : [body?.matricula].filter(Boolean)
  if (!matriculas.length) throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
  return await buildNoAdeudoPreviewPayload(event, matriculas.slice(0, 300), body?.ciclo || getQuery(event).ciclo || '2025')
}))
