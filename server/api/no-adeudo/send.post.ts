import { runWithBridgeAgentId } from '../../utils/db'
import { resolveNoAdeudoStudentContext, sendNoAdeudoForContext } from '../../utils/noAdeudo'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const matriculas = Array.isArray(body?.matriculas)
    ? body.matriculas
    : [body?.matricula].filter(Boolean)
  const ciclo = normalizeCicloKey(body?.ciclo || getQuery(event).ciclo || '2025')
  const mode = String(body?.mode || 'parents_control')
  const force = Boolean(body?.force)
  const blockOnDebt = body?.blockOnDebt === undefined ? undefined : Boolean(body.blockOnDebt)

  if (!matriculas.length) throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
  if (matriculas.length > 300) throw createError({ statusCode: 413, message: 'Máximo 300 cartas por lote.' })

  const results = []
  for (const matricula of matriculas) {
    try {
      const context = await resolveNoAdeudoStudentContext(event, matricula, ciclo)
      results.push(await sendNoAdeudoForContext(event, context, { ciclo, mode, force, blockOnDebt }))
    } catch (error: any) {
      results.push({
        matricula: String(matricula || ''),
        success: false,
        message: error?.data?.message || error?.statusMessage || error?.message || 'No se pudo generar la carta.'
      })
    }
  }

  return {
    ok: results.every((item: any) => item.success),
    total: results.length,
    sent: results.filter((item: any) => item.success).length,
    failed: results.filter((item: any) => !item.success).length,
    results
  }
}))
