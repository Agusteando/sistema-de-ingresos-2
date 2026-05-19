import { runWithBridgeAgentId, query } from '../../utils/db'

const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const queryParams = getQuery(event)
  const requestedPlantel = normalizePlantel(queryParams.plantel)
  const userPlantel = normalizePlantel(user?.active_plantel)
  const plantel = userPlantel && userPlantel !== 'GLOBAL' ? userPlantel : requestedPlantel

  if (!plantel || plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para calcular la matrícula.' })
  }

  const regex = `^${escapeRegExp(plantel)}[0-9]+$`
  const startAt = plantel.length + 1
  const rows = await query<any[]>(`
    SELECT matricula
    FROM base
    WHERE plantel = ? AND matricula REGEXP ?
    ORDER BY CAST(SUBSTRING(matricula, ${startAt}) AS UNSIGNED) DESC
    LIMIT 1
  `, [plantel, regex])

  const lastMatricula = String(rows[0]?.matricula || '')
  const numericPart = lastMatricula.slice(plantel.length)
  const lastNumber = Number(numericPart)
  const nextNumber = Number.isFinite(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1
  const numericWidth = Math.max(4, numericPart.length || 0)
  const nextMatricula = `${plantel}${String(nextNumber).padStart(numericWidth, '0')}`

  return {
    plantel,
    lastMatricula: lastMatricula || null,
    nextMatricula,
    preview: nextMatricula,
    source: lastMatricula ? 'last_existing_matricula' : 'empty_plantel_sequence'
  }
}))
