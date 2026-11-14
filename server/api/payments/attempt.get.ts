import { runWithBridgeAgentId } from '../../utils/db'
import { readPaymentAttempt } from '../../utils/payment-attempts'
import { validPaymentAttemptId } from '../../utils/payment-attempt-id.mjs'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const { reference, matricula, ciclo } = getQuery(event)
  const id = validPaymentAttemptId(reference)
  const studentId = String(matricula || '').trim()
  const cycleKey = normalizeCicloKey(String(ciclo || ''))
  if (!id || !studentId || studentId.length > 64 || !String(ciclo || '').trim()) {
    throw createError({ statusCode: 400, message: 'Solicitud no válida.' })
  }

  if (!event.context.user) throw createError({ statusCode: 401, message: 'Acceso requerido.' })

  return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const result = await readPaymentAttempt(id, studentId, cycleKey)
    if (result.status === 'confirmed') {
      return { status: 'confirmed', success: true, folios: result.folios }
    }
    if (result.status === 'missing') return { status: 'processing', success: false }
    return { status: 'unavailable', success: false }
  })
})
