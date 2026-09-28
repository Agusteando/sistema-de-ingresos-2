import { runWithBridgeAgentId } from '../../utils/db'
import { getTrustedAuthUser, normalizePlantel } from '../../utils/auth-session'
import { PLANTELES_LIST } from '../../../utils/constants'
import { loadDeudoresSaldoMargins } from '../../utils/deudores-settings'

const editablePlanteles = (user: any) => {
  const active = normalizePlantel(user?.active_plantel)
  if (active && active !== 'GLOBAL') return [active]
  if (user?.isSuperAdmin) return [...PLANTELES_LIST]
  return Array.from(new Set((user?.plantelesList || []).map(normalizePlantel).filter(Boolean)))
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = await getTrustedAuthUser(event)
  const planteles = editablePlanteles(user)
  const margins = await loadDeudoresSaldoMargins(planteles)

  return {
    activePlantel: normalizePlantel(user.active_plantel),
    defaultSaldoMargin: 0,
    options: planteles.map((plantel) => ({
      plantel,
      saldoMargin: margins.get(plantel) ?? 0,
    })),
  }
}))
