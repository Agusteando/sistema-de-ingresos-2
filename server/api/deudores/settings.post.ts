import { runWithBridgeAgentId } from '../../utils/db'
import { getTrustedAuthUser, normalizePlantel } from '../../utils/auth-session'
import { PLANTELES_LIST } from '../../../utils/constants'
import { saveDeudoresSaldoMargin } from '../../utils/deudores-settings'

const editablePlanteles = (user: any) => {
  const active = normalizePlantel(user?.active_plantel)
  if (active && active !== 'GLOBAL') return [active]
  if (user?.isSuperAdmin) return [...PLANTELES_LIST]
  return Array.from(new Set((user?.plantelesList || []).map(normalizePlantel).filter(Boolean)))
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = await getTrustedAuthUser(event)
  const body = await readBody(event)
  const plantel = normalizePlantel(body?.plantel)
  const rawMargin = Number(body?.saldoMargin)

  if (!plantel || !editablePlanteles(user).includes(plantel)) {
    throw createError({ statusCode: 403, message: 'No puedes configurar la tolerancia de ese plantel.' })
  }
  if (!Number.isFinite(rawMargin) || rawMargin < 0 || !Number.isInteger(rawMargin)) {
    throw createError({ statusCode: 400, message: 'La tolerancia debe ser un monto entero en pesos, igual o mayor a 0.' })
  }

  const saved = await saveDeudoresSaldoMargin({
    plantel,
    saldoMargin: rawMargin,
    updatedBy: user.email || user.name || 'sistema',
  })

  return { success: true, ...saved }
}))
