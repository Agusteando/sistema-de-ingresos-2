import { PLANTELES_LIST } from '../../utils/constants'
import { createError, getQuery } from 'h3'
import { getTrustedAuthUser, normalizePlantel, type AuthSessionUser } from './auth-session'
import { controlEscolarCentralQuery } from './control-escolar-central'

const VALID_PLANTELES = new Set(PLANTELES_LIST)
const AUDIT_RETENTION_DAYS = 180
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 120

export type ControlEscolarAuditEventType = 'control_login' | 'page_snapshot' | 'student_update'

type AuditProgress = {
  percent?: number | null
  total?: number | null
  completed?: number | null
  pending?: number | null
}

type AuditSource = {
  base?: string | null
  flow?: string | null
}

type AuditLogInput = {
  eventType: ControlEscolarAuditEventType
  plantel: string
  ciclo?: string | number | null
  matricula?: string | null
  user?: Partial<AuthSessionUser> | null
  summary: string
  progress?: AuditProgress
  source?: AuditSource
  payload?: Record<string, any> | null
}

type AuditQueryOptions = {
  plantel?: string
  ciclo?: string | number | null
  limit?: number
}

const cleanText = (value: unknown, max = 255) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const cleanCiclo = (value: unknown) => cleanText(value, 20)
const cleanMatricula = (value: unknown) => cleanText(value, 64).toUpperCase()
const clampPercent = (value: unknown) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, Number(number.toFixed(2))))
}
const safeNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null
}
const safeJson = (value: unknown) => {
  if (!value) return null
  try {
    return JSON.stringify(value).slice(0, 12000)
  } catch {
    return null
  }
}
const parsePayload = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, any>
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}
const normalizeAuditPlantel = (value: unknown) => normalizePlantel(value)

const isAllowedPlantel = (plantel: string, user: AuthSessionUser) => {
  if (!plantel || !VALID_PLANTELES.has(plantel)) return false
  return user.isSuperAdmin || user.plantelesList.map(normalizePlantel).includes(plantel)
}

const resolveRequestedPlantel = (event: any, user: AuthSessionUser, requested?: unknown) => {
  const plantel = normalizeAuditPlantel(requested || getQuery(event)?.plantel || user.active_plantel || user.auth_home_plantel)
  if (plantel === 'ALL' && user.isSuperAdmin) return 'ALL'
  if (plantel === 'GLOBAL' && user.isSuperAdmin) return 'ALL'
  if (isAllowedPlantel(plantel, user)) return plantel
  const fallback = normalizeAuditPlantel(user.auth_home_plantel || user.plantelesList[0])
  if (isAllowedPlantel(fallback, user)) return fallback
  throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este plantel.' })
}

const pruneAuditEvents = async (plantel: string, ciclo: string) => {
  await controlEscolarCentralQuery(
    `DELETE FROM control_escolar_audit_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [AUDIT_RETENTION_DAYS]
  ).catch(() => null)

  if (ciclo) {
    await controlEscolarCentralQuery(
      `DELETE FROM control_escolar_audit_events
       WHERE plantel = ? AND ciclo = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM control_escolar_audit_events
           WHERE plantel = ? AND ciclo = ?
           ORDER BY created_at DESC
           LIMIT 1500
         ) keepers
       )`,
      [plantel, ciclo, plantel, ciclo]
    ).catch(() => null)
  }
}

export const logControlEscolarAuditEvent = async (input: AuditLogInput) => {
  const plantel = normalizeAuditPlantel(input.plantel)
  if (!plantel || !VALID_PLANTELES.has(plantel)) return null

  const ciclo = cleanCiclo(input.ciclo || '')
  const matricula = cleanMatricula(input.matricula || '') || null
  const progress = input.progress || {}
  const source = input.source || {}
  const user = input.user || {}
  const payload = safeJson(input.payload || null)

  if (input.eventType === 'page_snapshot' && user.email) {
    const [recentSnapshot] = await controlEscolarCentralQuery<any[]>(
      `SELECT id FROM control_escolar_audit_events
       WHERE event_type = 'page_snapshot'
         AND plantel = ?
         AND ciclo = ?
         AND actor_email = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
       ORDER BY created_at DESC
       LIMIT 1`,
      [plantel, ciclo, cleanText(user.email, 255)]
    ).catch(() => [])
    if (recentSnapshot?.id) return { skipped: true, reason: 'recent_snapshot_exists' }
  }

  const result: any = await controlEscolarCentralQuery(
    `INSERT INTO control_escolar_audit_events (
      event_type, plantel, ciclo, matricula,
      actor_email, actor_name, actor_role, summary,
      progress_percent, total_students, completed_students, pending_students,
      source_base, source_flow, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.eventType,
      plantel,
      ciclo,
      matricula,
      cleanText(user.email, 255) || null,
      cleanText(user.name, 255) || null,
      cleanText(user.role, 255) || null,
      cleanText(input.summary, 255),
      clampPercent(progress.percent),
      safeNumber(progress.total),
      safeNumber(progress.completed),
      safeNumber(progress.pending),
      cleanText(source.base, 180) || null,
      cleanText(source.flow, 180) || null,
      payload,
    ]
  )

  await pruneAuditEvents(plantel, ciclo)
  return result
}

const normalizeEventRow = (row: any, plantelFallback = '') => ({
  id: Number(row.id || 0),
  type: cleanText(row.event_type || row.type, 40),
  plantel: normalizeAuditPlantel(row.plantel || plantelFallback),
  ciclo: cleanCiclo(row.ciclo || ''),
  matricula: cleanMatricula(row.matricula || ''),
  actorEmail: cleanText(row.actor_email || '', 255),
  actorName: cleanText(row.actor_name || '', 255),
  actorRole: cleanText(row.actor_role || '', 255),
  summary: cleanText(row.summary || '', 255),
  progressPercent: row.progress_percent == null ? null : Number(row.progress_percent),
  totalStudents: row.total_students == null ? null : Number(row.total_students),
  completedStudents: row.completed_students == null ? null : Number(row.completed_students),
  pendingStudents: row.pending_students == null ? null : Number(row.pending_students),
  sourceBase: cleanText(row.source_base || '', 180),
  sourceFlow: cleanText(row.source_flow || '', 180),
  payload: parsePayload(row.payload),
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
})

const fetchPlantelAudit = async (plantel: string, options: AuditQueryOptions) => {
  const limit = Math.min(MAX_LIMIT, Math.max(10, Number(options.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT))
  const ciclo = cleanCiclo(options.ciclo || '')
  const where: string[] = ['plantel = ?']
  const params: any[] = [plantel]
  if (ciclo) {
    where.push('ciclo = ?')
    params.push(ciclo)
  }

  const events = await controlEscolarCentralQuery<any[]>(
    `SELECT * FROM control_escolar_audit_events
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, limit]
  ).catch(() => [])

  const counts = await controlEscolarCentralQuery<any[]>(
    `SELECT event_type, COUNT(*) AS total
     FROM control_escolar_audit_events
     WHERE ${where.join(' AND ')} AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY event_type`,
    [...params, AUDIT_RETENTION_DAYS]
  ).catch(() => [])

  const latestSnapshot = await controlEscolarCentralQuery<any[]>(
    `SELECT * FROM control_escolar_audit_events
     WHERE ${where.join(' AND ')} AND event_type = 'page_snapshot'
     ORDER BY created_at DESC
     LIMIT 1`,
    params
  ).catch(() => [])

  const updatedStudents = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula, MAX(created_at) AS last_at, COUNT(*) AS total
     FROM control_escolar_audit_events
     WHERE ${where.join(' AND ')} AND event_type = 'student_update' AND matricula IS NOT NULL AND matricula <> ''
     GROUP BY matricula
     ORDER BY last_at DESC
     LIMIT 14`,
    params
  ).catch(() => [])

  return {
    plantel,
    events: events.map((event) => normalizeEventRow(event, plantel)),
    counts,
    latestSnapshot: latestSnapshot[0] ? normalizeEventRow(latestSnapshot[0], plantel) : null,
    updatedStudents: updatedStudents.map((row) => ({
      matricula: cleanMatricula(row.matricula),
      lastAt: row.last_at ? new Date(row.last_at).toISOString() : '',
      total: Number(row.total || 0),
    })),
  }
}

const mergeAuditResults = (results: Awaited<ReturnType<typeof fetchPlantelAudit>>[], limit: number) => {
  const events = results
    .flatMap((result) => result.events)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
  const countsMap = new Map<string, number>()
  const updatedMap = new Map<string, { matricula: string; lastAt: string; total: number; plantel: string }>()

  results.forEach((result) => {
    result.counts.forEach((entry: any) => {
      const type = cleanText(entry.event_type, 40)
      countsMap.set(type, (countsMap.get(type) || 0) + Number(entry.total || 0))
    })
    result.updatedStudents.forEach((student) => {
      const key = `${result.plantel}:${student.matricula}`
      updatedMap.set(key, { ...student, plantel: result.plantel })
    })
  })

  const latestSnapshots = results
    .map((result) => result.latestSnapshot)
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))

  return {
    events,
    counts: Array.from(countsMap.entries()).map(([event_type, total]) => ({ event_type, total })),
    latestSnapshot: latestSnapshots[0] || null,
    updatedStudents: Array.from(updatedMap.values())
      .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
      .slice(0, 14),
  }
}

const countsByType = (counts: any[]) => counts.reduce((acc: Record<string, number>, row: any) => {
  acc[cleanText(row.event_type, 40)] = Number(row.total || 0)
  return acc
}, {})

export const getControlEscolarAuditSummary = async (event: any, options: AuditQueryOptions = {}) => {
  const user = await getTrustedAuthUser(event)
  const requestedPlantel = resolveRequestedPlantel(event, user, options.plantel)
  const limit = Math.min(MAX_LIMIT, Math.max(10, Number(options.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT))
  const ciclo = cleanCiclo(options.ciclo || getQuery(event)?.ciclo || '')
  const planteles = requestedPlantel === 'ALL'
    ? (user.isSuperAdmin ? PLANTELES_LIST : user.plantelesList.map(normalizePlantel)).filter((plantel) => VALID_PLANTELES.has(plantel))
    : [requestedPlantel]

  const settled = await Promise.allSettled(planteles.map((plantel) => fetchPlantelAudit(plantel, { ciclo, limit: Math.ceil(limit / Math.max(1, planteles.length)) + 8 })))
  const results = settled.flatMap((entry) => entry.status === 'fulfilled' ? [entry.value] : [])
  const unavailablePlanteles = planteles.filter((_, index) => settled[index]?.status === 'rejected')
  const merged = mergeAuditResults(results, limit)
  const countMap = countsByType(merged.counts)
  const latest = merged.latestSnapshot
  const totalEvents = Object.values(countMap).reduce<number>((sum, value) => sum + Number(value || 0), 0)

  return {
    ok: true,
    filters: {
      plantel: requestedPlantel,
      ciclo,
      limit,
      watchedPlanteles: planteles,
      unavailablePlanteles,
    },
    summary: {
      totalEvents,
      loginCount: countMap.control_login || 0,
      snapshotCount: countMap.page_snapshot || 0,
      studentUpdateCount: countMap.student_update || 0,
      latestAt: merged.events[0]?.createdAt || '',
      watchedCiclo: latest?.ciclo || ciclo || '',
      progressPercent: latest?.progressPercent ?? null,
      totalStudents: latest?.totalStudents ?? null,
      completedStudents: latest?.completedStudents ?? null,
      pendingStudents: latest?.pendingStudents ?? null,
      sourceBase: latest?.sourceBase || '',
      sourceFlow: latest?.sourceFlow || '',
    },
    timeline: merged.events,
    updatedStudents: merged.updatedStudents,
  }
}
