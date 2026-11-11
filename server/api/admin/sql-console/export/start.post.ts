import { requireSqlConsoleAdmin, sqlExportPlantel, ensureSqlBridgeMode, sqlConsoleRelay } from '../../../../utils/sql-console-bridge'

export default defineEventHandler(async (event) => {
  requireSqlConsoleAdmin(event)
  ensureSqlBridgeMode()
  const body: any = await readBody(event)
  const plantel = sqlExportPlantel(body?.targetPlantel)
  const result: any = await sqlConsoleRelay(event, '/agents/' + encodeURIComponent(plantel) + '/export/start', 'POST')
  console.info('[sql-console-export]', { phase: 'started', plantel, exportId: result.exportId, actor: event.context.user?.email || '', requestId: event.context.auroraRequestId || '' })
  setHeader(event, 'Cache-Control', 'no-store')
  return { ok: true, targetPlantel: plantel, exportId: result.exportId, database: result.database, state: result.state }
})
