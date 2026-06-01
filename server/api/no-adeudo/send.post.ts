import { runWithBridgeAgentId } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const loadNoAdeudoModule = async () => await import('../../utils/noAdeudo')

const fallbackDiagnostic = (error: any, source = 'Envío de Carta de No Adeudo') => ({
  title: String(error?.message || error?.statusMessage || 'No se pudo cargar el módulo de Carta de No Adeudo.'),
  detail: 'El backend falló antes de cargar el diagnóstico especializado.',
  statusCode: Number(error?.statusCode || error?.status || 500),
  source,
  code: String(error?.code || 'NO_ADEUDO_MODULE_LOAD').toUpperCase(),
  action: 'Revisa el log del servidor para identificar el import o dependencia que impide cargar el módulo noAdeudo.'
})

const diagnose = async (error: any, source: string) => {
  try {
    const { diagnoseNoAdeudoError } = await loadNoAdeudoModule()
    return diagnoseNoAdeudoError(error, source)
  } catch (diagnosticError: any) {
    return fallbackDiagnostic(diagnosticError?.message ? diagnosticError : error, source)
  }
}

export default defineEventHandler(async (event) => {
  try {
    return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
      try {
        const { resolveNoAdeudoStudentContext, sendNoAdeudoForContext } = await loadNoAdeudoModule()
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
            const diagnostic = await diagnose(error, `Envío de Carta de No Adeudo · ${String(matricula || '')}`)
            results.push({
              matricula: String(matricula || ''),
              success: false,
              message: diagnostic.title,
              diagnostic
            })
          }
        }

        return {
          ok: results.every((item: any) => item.success),
          total: results.length,
          sent: results.filter((item: any) => item.success).length,
          failed: results.filter((item: any) => !item.success).length,
          results,
          diagnostics: results.map((item: any) => item.diagnostic).filter(Boolean)
        }
      } catch (error: any) {
        const diagnostic = await diagnose(error, 'Envío de Carta de No Adeudo')
        return {
          ok: false,
          total: 0,
          sent: 0,
          failed: 1,
          error: diagnostic.title,
          message: diagnostic.title,
          diagnostic,
          diagnostics: [diagnostic],
          results: [{ matricula: 'Lote', success: false, message: diagnostic.title, diagnostic }]
        }
      }
    })
  } catch (error: any) {
    const diagnostic = await diagnose(error, 'Envío de Carta de No Adeudo · middleware/bridge')
    return {
      ok: false,
      total: 0,
      sent: 0,
      failed: 1,
      error: diagnostic.title,
      message: diagnostic.title,
      diagnostic,
      diagnostics: [diagnostic],
      results: [{ matricula: 'Lote', success: false, message: diagnostic.title, diagnostic }]
    }
  }
})
