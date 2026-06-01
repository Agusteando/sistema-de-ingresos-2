import { runWithBridgeAgentId } from '../../utils/db'
import { buildNoAdeudoPreviewPayload, diagnoseNoAdeudoError } from '../../utils/noAdeudo'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  try {
    const body = await readBody(event)
    const matriculas = Array.isArray(body?.matriculas)
      ? body.matriculas
      : [body?.matricula].filter(Boolean)
    if (!matriculas.length) throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
    if (matriculas.length > 300) throw createError({ statusCode: 413, message: 'Máximo 300 cartas por lote.' })
    return await buildNoAdeudoPreviewPayload(event, matriculas.slice(0, 300), body?.ciclo || getQuery(event).ciclo || '2025')
  } catch (error) {
    const diagnostic = diagnoseNoAdeudoError(error, 'Previsualización de Carta de No Adeudo')
    return {
      ok: false,
      error: diagnostic.title,
      message: diagnostic.title,
      diagnostic,
      diagnostics: [diagnostic],
      total: 0,
      students: []
    }
  }
}))
