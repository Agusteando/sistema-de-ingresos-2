import { Readable } from 'node:stream'
import { requireSqlConsoleAdmin, sqlExportPlantel, sqlExportId, ensureSqlBridgeMode, sqlConsoleRelay } from '../../../utils/sql-console-bridge'

export default defineEventHandler(async (event) => {
  requireSqlConsoleAdmin(event)
  ensureSqlBridgeMode()
  const query = getQuery(event)
  const plantel = sqlExportPlantel(query.targetPlantel)
  const id = sqlExportId(query.exportId)
  const upstream: Response = await sqlConsoleRelay(
    event, '/agents/' + encodeURIComponent(plantel) + '/export/' + id + '/file', 'GET', true
  )
  if (!upstream.body) throw createError({ statusCode: 502, message: 'El bridge no entregó el archivo SQL.' })
  const bytes = Number(upstream.headers.get('content-length'))
  setHeader(event, 'Cache-Control', 'private, no-store, no-cache')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Type', 'application/sql; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="' + plantel + '-respaldo-completo.sql"')
  if (Number.isSafeInteger(bytes) && bytes > 0) setHeader(event, 'Content-Length', String(bytes))
  console.info('[sql-console-export]', {
    phase: 'download', plantel, exportId: id, bytes,
    actor: event.context.user?.email || '', requestId: event.context.auroraRequestId || ''
  })
  return await sendStream(event, Readable.fromWeb(upstream.body as any))
})
