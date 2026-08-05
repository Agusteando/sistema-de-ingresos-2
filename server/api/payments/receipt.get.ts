import { runWithBridgeAgentId } from '../../utils/db'
import { loadPaymentReceiptDocument } from '../../utils/paymentReceipt'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { folios } = getQuery(event)
  const receipt = await loadPaymentReceiptDocument(folios)
  return receipt.items
}))
