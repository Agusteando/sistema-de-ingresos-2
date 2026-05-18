import { query } from '../../utils/db'

const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const queryParams = getQuery(event)
  const requestedPlantel = normalizePlantel(queryParams.plantel)
  const userPlantel = normalizePlantel(user?.active_plantel)
  const plantel = userPlantel && userPlantel !== 'GLOBAL' ? userPlantel : requestedPlantel

  if (!plantel || plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel activo para estimar la matrícula.' })
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

  const last = String(rows[0]?.matricula || '')
  const lastNumber = Number(last.slice(plantel.length))
  const nextNumber = Number.isFinite(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1

  return {
    plantel,
    preview: `${plantel}${nextNumber}`,
    source: last ? 'last_existing_matricula' : 'empty_plantel_sequence',
    note: 'Vista previa. La matrícula real la genera el trigger al guardar.'
  }
})
