import { randomBytes } from 'node:crypto'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { runWithBridgeAgentId } from './db'
import { loadConceptReport } from './concept-report'
import { CONCEPTOS_PLANTELES_LIST } from '../../utils/constants'
import { automaticSchoolCycleKey, normalizeCicloKey } from '../../shared/utils/ciclo'
import { rollupConceptReports } from '../../shared/utils/shared-concept-rollup.mjs'
import { collectAvailableConceptReports } from '../../shared/utils/shared-concept-availability.mjs'

const TABLE = 'concept_report_public_links'
const MODES = new Set(['movements', 'missing', 'debtors'])
const allowed = new Set(CONCEPTOS_PLANTELES_LIST)
const tokenPattern = /^[a-zA-Z0-9_-]{32}$/

const requiredStorage = async <T>(sql: string, params: any[] = []): Promise<T> => {
  try {
    return await controlEscolarCentralQuery<T>(sql, params)
  } catch (error: any) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code) || /doesn't exist|unknown column/i.test(String(error?.message || ''))) {
      console.error('[public-concept-report] storage_not_ready', { code: error?.code })
      throw createError({ statusCode: 503, message: 'El almacenamiento de enlaces institucionales aún no está configurado.', data: { code: 'PUBLIC_CONCEPT_REPORT_SCHEMA_MISSING' } })
    }
    console.error('[public-concept-report] storage_failed', { code: error?.code, message: error?.message })
    throw error
  }
}

export function requireSharedConceptManager(user: any) {
  if (!user?.isSuperAdmin) throw createError({ statusCode: 403, message: 'Solo superadministración puede gestionar enlaces institucionales.' })
}

export type SharedConceptLink = {
  id: string
  conceptoId: number
  modo: 'movements' | 'missing' | 'debtors'
  ciclo: string
  planteles: string[]
  inicio: string
  fin: string
  threshold: number
  createdBy: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

function formatRow(row: any): SharedConceptLink {
  const list = typeof row.planteles_json === 'string' ? JSON.parse(row.planteles_json) : row.planteles_json
  return {
    id: String(row.id),
    conceptoId: Number(row.concepto_id),
    modo: row.modo,
    ciclo: String(row.ciclo),
    planteles: Array.isArray(list) ? list.filter((p:any) => allowed.has(String(p))) : [],
    inicio: row.inicio ? String(row.inicio).slice(0,10) : '',
    fin: row.fin ? String(row.fin).slice(0,10) : '',
    threshold: Number(row.threshold || 0),
    createdBy: String(row.created_by || ''),
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  }
}

const selectSql = 'SELECT id, concepto_id, modo, ciclo, planteles_json, inicio, fin, threshold, created_by, created_at, expires_at, revoked_at FROM ' + TABLE

export async function listSharedConceptLinks() {
  const rows = await requiredStorage<any[]>(selectSql + ' ORDER BY created_at DESC LIMIT 150')
  return rows.map(formatRow)
}

export async function createSharedConceptLink(input: any, user: any) {
  requireSharedConceptManager(user)
  const conceptoId = Number(input?.conceptoId)
  if (!Number.isSafeInteger(conceptoId) || conceptoId < 1) throw createError({ statusCode: 400, message: 'Seleccione un concepto válido.' })
  const modo = String(input?.modo || 'movements')
  if (!MODES.has(modo)) throw createError({ statusCode: 400, message: 'Modalidad no válida.' })
  const ciclo = normalizeCicloKey(input?.ciclo || automaticSchoolCycleKey())
  const requested = input?.planteles
  if (!Array.isArray(requested) || !requested.length || requested.length > CONCEPTOS_PLANTELES_LIST.length ||
      requested.some((p:any) => !allowed.has(String(p)))) {
    throw createError({ statusCode: 400, message: 'Seleccione planteles institucionales válidos.' })
  }
  const planteles = Array.from(new Set(requested.map((p:any) => String(p))))
  const inicio = String(input?.inicio || '')
  const fin = String(input?.fin || '')
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if ((inicio && !datePattern.test(inicio)) || (fin && !datePattern.test(fin)) || (inicio && fin && inicio > fin)) {
    throw createError({ statusCode: 400, message: 'Las fechas no son válidas.' })
  }
  const threshold = Number(input?.threshold || 0)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1e9) throw createError({ statusCode: 400, message: 'Umbral no válido.' })
  const expiryDays = Number(input?.expiryDays ?? 30)
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365) throw createError({ statusCode: 400, message: 'La vigencia debe ser de 1 a 365 días.' })
  const id = randomBytes(24).toString('base64url')
  await requiredStorage('INSERT INTO ' + TABLE +
    ' (id, concepto_id, modo, ciclo, planteles_json, inicio, fin, threshold, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))',
    [id, conceptoId, modo, ciclo, JSON.stringify(planteles), modo === 'movements' ? inicio || null : null, modo === 'movements' ? fin || null : null, modo === 'debtors' ? threshold : 0, user.email, expiryDays])
  return id
}

export async function revokeSharedConceptLink(id: string, user: any) {
  requireSharedConceptManager(user)
  if (!tokenPattern.test(id)) throw createError({ statusCode: 404, message: 'Enlace no encontrado.' })
  const result = await requiredStorage<any>('UPDATE ' + TABLE + ' SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()) WHERE id = ?', [id])
  if (!Number(result?.affectedRows || 0)) throw createError({ statusCode: 404, message: 'Enlace no encontrado.' })
}

export async function resolveSharedConceptLink(id: string) {
  if (!tokenPattern.test(id)) throw createError({ statusCode: 404, message: 'Enlace no encontrado.' })
  const rows = await requiredStorage<any[]>(selectSql + ' WHERE id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1', [id])
  const link = rows[0] && formatRow(rows[0])
  if (!link || link.revokedAt || (link.expiresAt && Date.parse(link.expiresAt) <= Date.now())) {
    throw createError({ statusCode: 404, message: 'Este enlace no está disponible.' })
  }
  if (!link.planteles.length) throw createError({ statusCode: 409, message: 'El enlace no tiene planteles válidos.' })
  return link
}

// Query each plantel independently with bounded bridge concurrency. The public
// report may be partial, but an unavailable campus is never counted as zero.
const loadFreshPublicConceptReport = async (link: SharedConceptLink) => {
  const { available, failures } = await collectAvailableConceptReports(link.planteles, async (plantel: string) => {
    const scopedUser = { isSuperAdmin: true, hasFinancialAccess: true, active_plantel: plantel }
    const report = await runWithBridgeAgentId(plantel, () => loadConceptReport(scopedUser, {
      plantel, conceptoId: link.conceptoId, modo: link.modo, ciclo: link.ciclo,
      inicio: link.inicio || undefined, fin: link.fin || undefined, threshold: link.threshold,
    }))
    if (!report || !Array.isArray(report.rows)) throw new Error('Invalid campus report response')
    return report
  })
  for (const { plantel, error } of failures) {
    console.error('[public-concept-report] campus_unavailable', {
      plantel,
      status: (error as any)?.statusCode || (error as any)?.status,
      code: (error as any)?.data?.code || (error as any)?.code,
      detail: String((error as any)?.message || 'Unknown campus query failure').slice(0, 240),
    })
  }
  if (!available.length) {
    throw createError({ statusCode: 503, message: 'No hay planteles disponibles para generar el reporte. Intente nuevamente más tarde.', data: { code: 'PUBLIC_CONCEPT_REPORT_NO_AVAILABLE_CAMPUSES' } })
  }
  const result = rollupConceptReports(available)
  const byPlantel = new Map(result.resumen.planteles.map((item: any) => [item.plantel, item]))
  const unavailable = failures.map(item => item.plantel)
  const cobertura = {
    solicitados: link.planteles.length,
    disponibles: available.length,
    noDisponibles: unavailable,
    parcial: unavailable.length > 0,
  }
  return {
    ...result,
    resumen: {
      ...result.resumen,
      planteles: link.planteles.map(plantel => byPlantel.get(plantel) || {
        plantel, alumnos: null, movimientos: null, inscritos: null, estado: 'unavailable',
      }),
    },
    cobertura,
    modo: link.modo,
    ciclo: link.ciclo,
    generatedAt: new Date().toISOString(),
  }
}

// Shareable links can have concurrent viewers. Coalesce identical expensive campus
// bridge queries and bound freshness to 45 seconds; every HTTP request still checks
// expiry and revocation in the central database before touching this cache.
const reportCache = new Map<string, { until: number, promise: Promise<any> }>()
export async function loadPublicSharedConceptReport(link: SharedConceptLink) {
  const now = Date.now()
  const cached = reportCache.get(link.id)
  if (cached && cached.until > now) return await cached.promise
  for (const [key, item] of reportCache) if (item.until <= now) reportCache.delete(key)
  if (reportCache.size >= 30) reportCache.delete(reportCache.keys().next().value!)
  const promise = loadFreshPublicConceptReport(link)
  reportCache.set(link.id, { until: now + 45_000, promise })
  try { return await promise }
  catch (error) { reportCache.delete(link.id); throw error }
}
