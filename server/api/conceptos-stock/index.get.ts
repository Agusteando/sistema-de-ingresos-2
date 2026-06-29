import { readBestStockSnapshots, readStockMovements } from '../../utils/conceptos-stock'
import { isConceptosPlantel } from '../../../utils/constants'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')
  const { plantel = '', conceptoId = '', movements = 'false' } = getQuery(event)
  const conceptoIds = Number(conceptoId || 0) > 0 ? [Number(conceptoId)] : []
  const stock = await readBestStockSnapshots({ plantel, conceptoIds })
  const visibleSnapshots = stock.snapshots.filter((snapshot: any) => isConceptosPlantel(String(snapshot.plantel || '')))
  const response: any = { ok: true, source: stock.source, snapshots: visibleSnapshots }
  if (String(movements) === 'true') {
    const movementPayload = await readStockMovements({ plantel, conceptoId })
    response.movements = { ...movementPayload, movements: (movementPayload.movements || []).filter((movement: any) => isConceptosPlantel(String(movement.plantel || ''))) }
  }
  return response
})
