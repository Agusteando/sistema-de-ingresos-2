import { getControlEscolarAuditSummary } from '../../../utils/control-escolar-audit'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  return await getControlEscolarAuditSummary(event, {
    plantel: String(query.plantel || ''),
    ciclo: String(query.ciclo || ''),
    limit: Number(query.limit || 60),
  })
})
