import { getTrustedAuthUser } from '../../../utils/auth-session'
import { logControlEscolarAuditEvent } from '../../../utils/control-escolar-audit'
import { PLANTELES_LIST } from '../../../../utils/constants'

const cleanText = (value: unknown, max = 255) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const cleanPlantel = (value: unknown) => String(value || '').trim().toUpperCase()
const safeNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const user = await getTrustedAuthUser(event)
  const body = await readBody(event)
  const plantel = cleanPlantel(body?.plantel || body?.agentId || user.active_plantel || user.auth_home_plantel)
  const allowed = user.isSuperAdmin || user.plantelesList.map(cleanPlantel).includes(plantel)
  if (!PLANTELES_LIST.includes(plantel) || !allowed) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para auditar este plantel.' })
  }
  const ciclo = cleanText(body?.ciclo || body?.cicloKey || '', 20)
  const progress = body?.progress || {}
  const source = body?.source || {}
  const progressPercent = safeNumber(progress.percent)
  const total = safeNumber(progress.total)
  const completed = safeNumber(progress.completed)
  const pending = safeNumber(progress.pending)

  await logControlEscolarAuditEvent({
    eventType: 'page_snapshot',
    plantel,
    ciclo,
    user,
    summary: `Vista Control Escolar ${plantel} ciclo ${ciclo || 'sin ciclo'}: ${progressPercent ?? 0}% de avance`,
    progress: {
      percent: progressPercent,
      total,
      completed,
      pending,
    },
    source: {
      base: source.base,
      flow: source.flow || source.phase,
    },
    payload: {
      visibleRows: safeNumber(body?.visibleRows),
      totalRows: safeNumber(body?.totalRows),
      counters: body?.counters || null,
      source,
      snapshotReason: body?.reason || 'control_escolar_page_loaded',
    },
  })

  return { ok: true }
})
