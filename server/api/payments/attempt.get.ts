import { runWithBridgeAgentId } from '../../utils/db'
import { readPaymentAttempt } from '../../utils/payment-attempts'
import { validPaymentAttemptId } from '../../utils/payment-attempt-id.mjs'

export default defineEventHandler(async (event) => {
  const { reference, matricula } = getQuery(event)
  const id = validPaymentAttemptId(reference)
  const studentId = String(matricula || '').trim()
  if (!id || !studentId || studentId.length > 64) {
    throw createError({ statusCode: 400, message: 'Solicitud no válida.' })
  }

  return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const result = await readPaymentAttempt(id, studentId)
    if (result.status === 'confirmed') {
      return { status: 'confirmed', success: true, folios: result.folios }
    }
    if (result.status === 'missing') return { status: 'processing', success: false }
    return { status: 'unavailable', success: false }
  })
})
