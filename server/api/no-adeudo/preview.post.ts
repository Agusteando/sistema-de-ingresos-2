import { runWithBridgeAgentId } from '../../utils/db'

const normalizePreviewError = async (error: any, source = 'Previsualización de Carta de No Adeudo') => {
  try {
    const { diagnoseNoAdeudoError } = await import('../../utils/noAdeudo')
    return diagnoseNoAdeudoError(error, source)
  } catch (diagnosticError: any) {
    const message = String(error?.message || error?.statusMessage || error?.data?.message || 'No se pudo preparar la carta.')
    const importMessage = String(diagnosticError?.message || '')
    return {
      title: message && !/^server error$/i.test(message) ? message : 'No se pudo cargar el módulo de Carta de No Adeudo.',
      detail: importMessage || 'El backend falló antes de cargar el diagnóstico especializado.',
      statusCode: Number(error?.statusCode || error?.status || 500),
      source,
      code: String(error?.code || diagnosticError?.code || 'NO_ADEUDO_MODULE_LOAD').toUpperCase(),
      action: 'Revisa el log del servidor para identificar el import o dependencia que impide cargar el módulo noAdeudo.'
    }
  }
}

const previewErrorResponse = async (event: any, error: any, source?: string) => {
  const diagnostic = await normalizePreviewError(error, source)
  setResponseStatus(event, 200)
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

export default defineEventHandler(async (event) => {
  try {
    return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
      try {
        const { buildNoAdeudoPreviewPayload } = await import('../../utils/noAdeudo')
        const body = await readBody(event)
        const matriculas = Array.isArray(body?.matriculas)
          ? body.matriculas
          : [body?.matricula].filter(Boolean)
        if (!matriculas.length) throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
        if (matriculas.length > 300) throw createError({ statusCode: 413, message: 'Máximo 300 cartas por lote.' })
        return await buildNoAdeudoPreviewPayload(event, matriculas.slice(0, 300), body?.ciclo || getQuery(event).ciclo || '2025')
      } catch (error) {
        return await previewErrorResponse(event, error)
      }
    })
  } catch (error) {
    return await previewErrorResponse(event, error, 'Previsualización de Carta de No Adeudo · middleware/bridge')
  }
})
