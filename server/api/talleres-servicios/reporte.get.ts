import { loadTalleresReport } from '../../utils/talleres-report'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  return await loadTalleresReport({
    event,
    ciclo: query.ciclo,
    requestedPlantel: query.plantel,
    includeStudents: String(query.detalle || '') === '1',
  })
})
