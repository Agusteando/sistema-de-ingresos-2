import { readBestStockSnapshots, readStockMovements } from '../../utils/conceptos-stock'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')
  const { plantel = '', conceptoId = '', movements = 'false' } = getQuery(event)
  const conceptoIds = Number(conceptoId || 0) > 0 ? [Number(conceptoId)] : []
  const stock = await readBestStockSnapshots({ plantel, conceptoIds })
  const response: any = { ok: true, source: stock.source, snapshots: stock.snapshots }
  if (String(movements) === 'true') {
    response.movements = await readStockMovements({ plantel, conceptoId })
  }
  return response
})
