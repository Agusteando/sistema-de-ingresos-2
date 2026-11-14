import { timingSafeEqual } from 'node:crypto'
import { getDbTransport, runRawSqlStatement } from '../../utils/db'
import { controlEscolarCentralQuery } from '../../utils/control-escolar-central'

const DEFAULT_PROBE_TIMEOUT_MS = 2500
const MAX_PROBE_TIMEOUT_MS = 3000

const safeTokenEquals = (provided: string, expected: string) => {
  if (!provided || !expected || provided.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    return false
  }
}

const errorMessage = (error: any) => String(error?.message || error?.code || 'Error de conexión').trim()

const probeTimeoutMs = () => {
  const configured = Number(process.env.LOCAL_SYSTEM_HEALTH_PROBE_TIMEOUT_MS || DEFAULT_PROBE_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_PROBE_TIMEOUT_MS
  return Math.max(500, Math.min(Math.floor(configured), MAX_PROBE_TIMEOUT_MS))
}

const withDeadline = async <T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error: any = new Error(`${label} no respondió antes de ${timeoutMs}ms`)
      error.code = 'LOCAL_SYSTEM_HEALTH_PROBE_TIMEOUT'
      reject(error)
    }, timeoutMs)
    timer.unref?.()
  })

  try {
    return await Promise.race([operation, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const runProbe = async <T>(label: string, operation: () => Promise<T>) => {
  const startedAt = Date.now()
  try {
    const result = await withDeadline(operation(), probeTimeoutMs(), label)
    return { result, error: '', latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { result: null as T | null, error: errorMessage(error), latencyMs: Date.now() - startedAt }
  }
}

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

  // Availability must never wait for the remote tunnel. Central diagnostics
  // remain opt-in and do not influence HTTP status or local readiness.
  const localProbe = await runProbe<any[]>('MySQL local', () =>
    runRawSqlStatement<any[]>('SELECT 1 AS ok, DATABASE() AS databaseName, NOW() AS serverTime')
  )
  const checkCentral = String(getQuery(event).central || '') === '1'
  const centralProbe = checkCentral
    ? await runProbe<any[]>('Base central', () => controlEscolarCentralQuery<any[]>('SELECT 1 AS ok, DATABASE() AS databaseName'))
    : { result: null as any[] | null, error: '', latencyMs: 0 }

  const localRow = Array.isArray(localProbe.result) ? localProbe.result[0] : null
  const centralRow = Array.isArray(centralProbe.result) ? centralProbe.result[0] : null
  const mysqlOk = Number(localRow?.ok || 0) === 1
  const centralOk = Number(centralRow?.ok || 0) === 1
  const ok = mysqlOk

  if (!ok) setResponseStatus(event, 503)
  setHeader(event, 'Cache-Control', 'no-store')

  return {
    ok,
    message: ok
      ? 'Sistema Rápido está listo.'
      : [
          !mysqlOk ? `MySQL local: ${localProbe.error || 'sin respuesta válida'}` : ''
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
      latencyMs: localProbe.latencyMs,
      error: localProbe.error || null
    },
    central: {
      checked: checkCentral,
      ok: centralOk,
      database: centralRow?.databaseName || null,
      latencyMs: centralProbe.latencyMs,
      error: centralProbe.error || null
    }
  }
})
