import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { getDeudoresGlobal } from '../../utils/deudores'
import { calculatePromotedGrado, displayGrado, nivelFromPlantel } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const { ciclo = '2025', estatus = 'deudores', detalles = '0' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  const includeDesglose = detalles === '1' || detalles === 'true'

  const scopedPlantel = (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL'))
    ? user.active_plantel
    : undefined

  const rows = await getDeudoresGlobal({
    ciclo: cicloKey,
    plantel: scopedPlantel,
    userEmail: user?.email,
    includeDesglose
  })

  const enriched = rows.map((row) => {
    const promoted = calculatePromotedGrado(row.grado, row.plantel, cicloKey, cicloKey)
    return {
      ...row,
      grado: displayGrado(promoted.grado),
      nivel: nivelFromPlantel(row.plantel)
    }
  })

  if (estatus === 'todos') return enriched
  if (estatus === 'no_deudores') return enriched.filter(r => !r.isDeudor)
  return enriched.filter(r => r.isDeudor)
})
