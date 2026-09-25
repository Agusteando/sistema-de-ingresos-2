import { getQuery } from 'h3'
import { query, runWithBridgeAgentId } from '../../utils/db'
import { loadRecargoPolicies } from '../../utils/recargo-config'
import { canRemoveLateFee, isLateFeeRemovalWindowOpen, LATE_FEE_REMOVAL_LOCK_DAY } from '../../../shared/utils/recargo'
import { formatMexicoCityDateKeyFromUnix } from '../../utils/payment-time'

const normalizeConceptIds = (value: unknown) => Array.from(new Set(
  String(value || '')
    .split(',')
    .map(item => Number(item.trim()))
    .filter(id => Number.isInteger(id) && id > 0),
)).slice(0, 100)

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const ids = normalizeConceptIds(getQuery(event).ids)
  const user = event.context.user
  const [dbClock] = await query<any[]>(`SELECT UNIX_TIMESTAMP() AS currentUnix`)
  const currentUnix = Number(dbClock?.currentUnix || Math.floor(Date.now() / 1000))
  const currentDateKey = formatMexicoCityDateKeyFromUnix(currentUnix)
  const capabilities = {
    canRemoveRecargo: canRemoveLateFee({
      roles: user?.roles || user?.role,
      financialPlanteles: user?.financialPlantelesList || user?.financialPlanteles,
      currentDateValue: currentDateKey,
    }),
    removalWindowOpen: isLateFeeRemovalWindowOpen(currentDateKey),
    removalLockDay: LATE_FEE_REMOVAL_LOCK_DAY,
    currentDate: currentDateKey,
  }

  if (!ids.length) return { policies: [], capabilities }

  const policies = await loadRecargoPolicies(ids)
  return {
    capabilities,
    policies: ids.map((conceptoId) => {
      const policy = policies.get(conceptoId)
      return {
        conceptoId,
        activo: Boolean(policy?.activo),
        servicio: Boolean(policy?.esServicio),
        porcentaje: Number(policy?.porcentaje ?? 10),
        diaLimite: Number(policy?.diaLimite ?? 12),
        pendingSync: Boolean(policy?.pendingSync),
      }
    }),
  }
}))
