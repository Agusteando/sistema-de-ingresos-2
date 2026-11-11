import { createFullSqlSnapshot, SQL_EXPORT_DATABASE } from '../../../utils/sql-console-export.mjs'

let exportInProgress = false

export default defineEventHandler(async (event) => {
  if (!event.context.user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede exportar la base de datos.' })
  }
  if (exportInProgress) {
    throw createError({ statusCode: 429, message: 'Ya hay una exportación SQL en curso. Intenta de nuevo cuando termine.' })
  }
  exportInProgress = true
  const startedAt = Date.now()
  const requestId = String(event.context.auroraRequestId || '')
  const actor = event.context.user.email
  let snapshot
  try {
    const config = useRuntimeConfig(event)
    // This is the Aurora-hosted ingresos database, not the selected bridge agent.
    snapshot = await createFullSqlSnapshot({
      host: String(config.mysqlHost || 'localhost'),
      port: Number(config.mysqlPort || 3306),
      user: String(config.mysqlUser || 'root'),
      password: String(config.mysqlPassword || ''),
      binary: process.env.SQL_EXPORT_BINARY || 'mariadb-dump'
    })
    console.info('[sql-console-export] completed', {
      requestId, actor, database: SQL_EXPORT_DATABASE, bytes: snapshot.bytes,
      durationMs: Date.now() - startedAt
    })
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    setHeader(event, 'Cache-Control', 'private, no-store, no-cache, max-age=0')
    setHeader(event, 'Pragma', 'no-cache')
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    setHeader(event, 'Content-Type', 'application/sql; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="ingresos-${timestamp}.sql"`)
    setHeader(event, 'Content-Length', String(snapshot.bytes))
    return await sendStream(event, snapshot.openStream())
  } catch (error) {
    console.error('[sql-console-export] failed', {
      requestId, actor, database: SQL_EXPORT_DATABASE,
      code: error?.code || 'EXPORT_FAILED',
      exitCode: error?.exitCode ?? null,
      diagnostic: error?.diagnostic || String(error?.message || '').slice(0, 300),
      durationMs: Date.now() - startedAt
    })
    if (snapshot) throw error
    throw createError({
      statusCode: 502,
      message: 'No se pudo generar el respaldo SQL completo. Revisa la conexión, los permisos MySQL y el registro del servidor.',
      data: { code: 'SQL_FULL_EXPORT_FAILED', requestId }
    })
  } finally {
    await snapshot?.cleanup()
    exportInProgress = false
  }
})
