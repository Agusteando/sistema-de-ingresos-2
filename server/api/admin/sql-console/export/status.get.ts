import { requireSqlConsoleAdmin, sqlExportPlantel, sqlExportId, ensureSqlBridgeMode, sqlConsoleRelay } from '../../../../utils/sql-console-bridge'

export default defineEventHandler(async (event) => {
  requireSqlConsoleAdmin(event)
  ensureSqlBridgeMode()
  const query = getQuery(event)
  const plantel = sqlExportPlantel(query.targetPlantel)
  const id = sqlExportId(query.exportId)
  setHeader(event, 'Cache-Control', 'no-store')
  const result: any = await sqlConsoleRelay(event, '/agents/' + encodeURIComponent(plantel) + '/export/' + id + '/status')
  return { ok: true, targetPlantel: plantel, exportId: id, database: result.database, state: result.state, bytes: result.bytes, code: result.code }
})
