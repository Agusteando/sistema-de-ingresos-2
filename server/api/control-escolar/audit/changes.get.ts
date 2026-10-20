import { getQuery, setResponseHeader } from 'h3'
import { PLANTELES_LIST } from '../../../../utils/constants'
import { getTrustedAuthUser, normalizePlantel } from '../../../utils/auth-session'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { CATEGORIES, buildAuditChanges } from '../../../utils/audit-change-events'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin && !user.hasControlEscolarRole) {
    throw createError({ statusCode: 403, message: 'Acceso restringido a Control Escolar.' })
  }
  const query = getQuery(event)
  const requested = normalizePlantel(query.plantel)
  const allowed = user.isSuperAdmin ? PLANTELES_LIST : user.plantelesList
  const planteles = requested && requested !== 'ALL'
    ? (allowed.includes(requested) ? [requested] : [])
    : allowed.filter((item) => PLANTELES_LIST.includes(item))
  if (!planteles.length) throw createError({ statusCode: 403, message: 'Plantel no autorizado.' })

  const dateFormat = /^\d{4}-\d{2}-\d{2}$/
  const todayParts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const todayPart = (type: string) => todayParts.find(x=>x.type===type)?.value || ''
  const today = todayPart('year') + '-' + todayPart('month') + '-' + todayPart('day')
  const to = String(query.to || today)
  const startDay = new Date(to + 'T12:00:00Z')
  if (Number.isNaN(startDay.getTime())) throw createError({statusCode:400,message:'Fecha inválida.'})
  startDay.setUTCDate(startDay.getUTCDate()-6)
  const from = String(query.from || startDay.toISOString().slice(0,10))
  if (!dateFormat.test(from) || !dateFormat.test(to) || from > to) throw createError({statusCode:400,message:'Fechas inválidas.'})
  const range = new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()
  if (!Number.isFinite(range) || range > 92*86400000) throw createError({statusCode:400,message:'Selecciona un periodo de hasta 90 días.'})
  const limit = 5000
  const placeholders = planteles.map(() => '?').join(',')
  const rows = await controlEscolarCentralQuery<any[]>(
    "SELECT id, event_type, plantel, ciclo, matricula, actor_email, actor_name, actor_role, source_flow, payload, " +
      "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS recorded_at " +
      "FROM control_escolar_audit_events WHERE event_type = 'student_update' " +
      "AND plantel IN (" + placeholders + ") AND created_at >= ? AND created_at < ? " +
      "ORDER BY created_at DESC, id DESC LIMIT ?",
    [...planteles, from + ' 00:00:00', to + ' 23:59:59.999999', limit + 1]
  )
  const truncated = rows.length > limit
  const selected = rows.slice(0, limit)
  const changes = await buildAuditChanges(selected)
  return {
    recovery:await readAuditRecoveryCoverage(),
    categories: CATEGORIES,
    allowedPlanteles: allowed.filter(item => PLANTELES_LIST.includes(item)),
    events: changes,
    truncated,
    systems: ['Aurora', 'Husky Pass', 'Otro'],
    sources: { ledger: 'control_escolar_audit_events', legacyValuesIncomplete: true },
    generatedAt: new Date().toISOString()
  }
})
