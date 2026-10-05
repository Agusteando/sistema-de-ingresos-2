import { getQuery } from 'h3'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { controlEscolarCentralQuery } from '../../../../utils/control-escolar-central'
import { normalizeExternalControlEscolarPlantel } from '../../../../utils/control-escolar-plantel-routing'
import { normalizeCicloKey } from '../../../../../shared/utils/ciclo'

const clean = (value: unknown, max = 255) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const safeJson = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, any>
  try { return JSON.parse(String(value)) } catch { return null }
}

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)

  const query = getQuery(event)
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')

  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT
       id,
       progress_percent,
       total_students,
       completed_students,
       pending_students,
       source_base,
       source_flow,
       payload,
       created_at
     FROM control_escolar_audit_events
     WHERE event_type = 'page_snapshot'
       AND plantel = ?
       AND ciclo = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [plantel, ciclo]
  )

  const row = rows?.[0]
  if (!row) {
    return {
      data: null,
      meta: { plantel, ciclo, found: false }
    }
  }

  const payload = safeJson(row.payload) || {}
  const counters = payload?.counters && typeof payload.counters === 'object'
    ? payload.counters
    : null

  return {
    data: {
      progressPercent: row.progress_percent == null ? null : Number(row.progress_percent),
      totalStudents: row.total_students == null ? null : Number(row.total_students),
      completedStudents: row.completed_students == null ? null : Number(row.completed_students),
      pendingStudents: row.pending_students == null ? null : Number(row.pending_students),
      totalRows: payload?.totalRows == null ? null : Number(payload.totalRows),
      visibleRows: payload?.visibleRows == null ? null : Number(payload.visibleRows),
      counters: counters
        ? {
            totalInscritos: Number(counters.totalInscritos ?? counters.inscritos ?? 0),
            inscritos: Number(counters.inscritos ?? counters.totalInscritos ?? 0),
            noInscritos: Number(counters.noInscritos ?? 0),
            bajas: Number(counters.bajas ?? 0),
            activos: Number(counters.activos ?? 0),
            totalVisible: Number(counters.totalVisible ?? 0)
          }
        : null,
      sourceBase: clean(row.source_base, 180),
      sourceFlow: clean(row.source_flow, 180),
      snapshotReason: clean(payload?.snapshotReason, 120),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
    },
    meta: {
      plantel,
      ciclo,
      found: true,
      version: 'control-escolar-ui-audit-v1'
    }
  }
})
