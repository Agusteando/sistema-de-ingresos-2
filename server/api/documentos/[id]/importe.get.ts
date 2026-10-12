import { runWithBridgeAgentId } from '../../../utils/db'
import { readDocumentAmountCorrection } from '../../../utils/document-amount-correction'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  if (!event.context.user?.hasFinancialAccess && !event.context.user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Se requiere acceso a Finanzas para ajustar importes.' })
  }
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const documento = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(documento) || documento <= 0) throw createError({ statusCode: 400, message: 'Documento inválido.' })
  return await readDocumentAmountCorrection(documento, getQuery(event).ciclo)
}))
