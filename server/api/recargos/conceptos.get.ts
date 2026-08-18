import { getQuery } from 'h3'
import { runWithBridgeAgentId } from '../../utils/db'
import { loadRecargoPolicies } from '../../utils/recargo-config'

const normalizeConceptIds = (value: unknown) => Array.from(new Set(
  String(value || '')
    .split(',')
    .map(item => Number(item.trim()))
    .filter(id => Number.isInteger(id) && id > 0),
)).slice(0, 100)

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const ids = normalizeConceptIds(getQuery(event).ids)
  if (!ids.length) return { policies: [] }

  const policies = await loadRecargoPolicies(ids)
  return {
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
