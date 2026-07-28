import { runWithBridgeAgentId } from '../../utils/db'
import { loadPlantelCorteCaja } from '../../utils/corte-caja'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const filters = getQuery(event)
  const user = event.context.user
  const result = await loadPlantelCorteCaja(user, filters)

  return {
    rows: result.rows,
    totales: result.totales,
    total: result.total,
    totalRegistrado: result.totalRegistrado,
    totalNoAplicado: result.totalNoAplicado,
    usuario: result.usuario,
    filtros: result.filtros
  }
}))
