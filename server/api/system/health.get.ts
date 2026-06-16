import { timingSafeEqual } from 'node:crypto'
import { getDbTransport, runRawSqlStatement } from '../../utils/db'
import { controlEscolarCentralQuery } from '../../utils/control-escolar-central'

const safeTokenEquals = (provided: string, expected: string) => {
  if (!provided || !expected || provided.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    return false
  }
}

const errorMessage = (error: any) => String(error?.message || error?.code || 'Error de conexión').trim()

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const provided = String(getHeader(event, 'x-local-system-token') || '')
  const expected = String(process.env.LOCAL_SYSTEM_MANAGER_TOKEN || config.localSystemManagerToken || '')

  if (!safeTokenEquals(provided, expected)) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  const transport = getDbTransport()
  if (transport !== 'direct') {
    throw createError({ statusCode: 503, message: 'Sistema Rápido requiere DB_TRANSPORT=direct.' })
  }

  const localStartedAt = Date.now()
  let localRow: any = null
  let localError = ''
  try {
    const rows = await runRawSqlStatement<any[]>('SELECT 1 AS ok, DATABASE() AS databaseName, NOW() AS serverTime')
    localRow = Array.isArray(rows) ? rows[0] : null
  } catch (error) {
    localError = errorMessage(error)
  }
  const localLatencyMs = Date.now() - localStartedAt

  const centralStartedAt = Date.now()
  let centralRow: any = null
  let centralError = ''
  try {
    const rows = await controlEscolarCentralQuery<any[]>('SELECT 1 AS ok, DATABASE() AS databaseName')
    centralRow = Array.isArray(rows) ? rows[0] : null
  } catch (error) {
    centralError = errorMessage(error)
  }
  const centralLatencyMs = Date.now() - centralStartedAt

  const mysqlOk = Number(localRow?.ok || 0) === 1
  const centralOk = Number(centralRow?.ok || 0) === 1
  const ok = mysqlOk && centralOk
  if (!ok) setResponseStatus(event, 503)

  return {
    ok,
    message: ok
      ? 'Sistema Rápido está listo.'
      : [
          !mysqlOk ? `MySQL local: ${localError || 'sin respuesta válida'}` : '',
          !centralOk ? `Base central: ${centralError || 'sin respuesta válida'}` : ''
        ].filter(Boolean).join(' · '),
    service: 'sistema-rapido',
    transport,
    build: {
      sha: String(process.env.LOCAL_SYSTEM_BUILD_SHA || config.localSystemBuildSha || ''),
      version: String(process.env.LOCAL_SYSTEM_BUILD_VERSION || config.localSystemBuildVersion || ''),
      builtAt: String(process.env.LOCAL_SYSTEM_BUILD_DATE || config.localSystemBuildDate || '')
    },
    mysql: {
      ok: mysqlOk,
      database: localRow?.databaseName || null,
      serverTime: localRow?.serverTime || null,
      latencyMs: localLatencyMs,
      error: localError || null
    },
    central: {
      ok: centralOk,
      database: centralRow?.databaseName || null,
      latencyMs: centralLatencyMs,
      error: centralError || null
    }
  }
})
