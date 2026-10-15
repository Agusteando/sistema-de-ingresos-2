import { getQuery, setResponseHeader } from 'h3'
import { PLANTELES_LIST } from '../../../../utils/constants'
import { getTrustedAuthUser, normalizePlantel } from '../../../utils/auth-session'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail } from '../../../utils/google-workspace-directory'
import { cleanAuditAvatar, loadAuditStaffProfiles } from '../../../utils/audit-actor-profile'

const CATEGORIES = [
  { key: 'grupo', label: 'Grupo' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'grado', label: 'Grado' },
  { key: 'estatus', label: 'Estatus' },
  { key: 'contacto', label: 'Contacto' },
  { key: 'trabajo', label: 'Lugares de trabajo' },
  { key: 'otros', label: 'Otros campos' }
]

const fieldCategory = (raw: string) => {
  const field = raw.replace(/[_\s-]/g, '').toLowerCase()
  if (field.includes('lugartrabajo')) return 'trabajo'
  if (field === 'grupo' || field === 'group') return 'grupo'
  if (['nombres', 'nombre', 'apellidopaterno', 'apellidomaterno', 'nombrecompletoalumno', 'nombreverificado'].includes(field)) return 'nombre'
  if (['grado', 'nivel', 'lastgrade', 'ciclo', 'lastciclo'].includes(field)) return 'grado'
  if (['estatus', 'status', 'baja', 'categoriaBaja', 'categoriabaja', 'motivoBaja', 'motivobaja', 'verified', 'interno', 'eventual'].includes(field)) return 'estatus'
  if (/telefono|email|correo|domicilio|direccion|contacto/.test(field)) return 'contacto'
  return 'otros'
}

const FIELD_NAMES: Record<string, string> = {
  grupo: 'Grupo', grado: 'Grado', nivel: 'Nivel', ciclo: 'Ciclo',
  nombres: 'Nombre(s)', apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno', apellidoPaterno: 'Apellido paterno',
  apellidoMaterno: 'Apellido materno', nombreVerificado: 'Nombre verificado',
  lugar_trabajo_padre: 'Trabajo del padre', lugar_trabajo_madre: 'Trabajo de la madre',
  lugarTrabajoPadre: 'Trabajo del padre', lugarTrabajoMadre: 'Trabajo de la madre',
  email_padre: 'Correo del padre', email_madre: 'Correo de la madre',
  telefono_padre: 'Teléfono del padre', telefono_madre: 'Teléfono de la madre',
  nombre_padre: 'Nombre del padre', nombre_madre: 'Nombre de la madre',
  baja: 'Baja', estatus: 'Estatus', status: 'Estatus', interno: 'Interno',
  verified: 'Verificado', eventual: 'Eventual'
}
const fieldLabel = (field: string) => FIELD_NAMES[field] || field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')

const safePayload = (value: any): Record<string, any> => {
  try {
    const parsed = typeof value === 'object' ? value : JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
const safeValue = (value: any): string | null => {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text.slice(0, 500)
}

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
      "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS recorded_at " +
      "FROM control_escolar_audit_events WHERE event_type = 'student_update' " +
      "AND plantel IN (" + placeholders + ") AND created_at >= ? AND created_at < ? " +
      "ORDER BY created_at DESC, id DESC LIMIT ?",
    [...planteles, from + ' 00:00:00', to + ' 23:59:59.999999', limit + 1]
  )
  const truncated = rows.length > limit
  const selected = rows.slice(0, limit)
  const detailed = selected.filter((row) => Array.isArray(safePayload(row.payload).changes))
  const detailedKeys = new Set(detailed.map((row) => [row.matricula, row.actor_email, String(row.recorded_at || '').slice(0, 16)].join('|')))
  const keys = Array.from(new Set(selected.map((row) => String(row.matricula || '').toUpperCase()).filter(Boolean))).slice(0, 1000)
  const nameByMatricula = new Map<string, string>()
  for (let start = 0; start < keys.length; start += 200) {
    const batch = keys.slice(start, start + 200)
    const studentRows = await controlEscolarCentralQuery<any[]>(
      'SELECT matricula, nombres, apellido_paterno, apellido_materno FROM matricula WHERE UPPER(matricula) IN (' + batch.map(() => '?').join(',') + ')',
      batch
    ).catch(() => [])
    for (const row of studentRows) {
      nameByMatricula.set(String(row.matricula || '').toUpperCase(),
        [row.nombres, row.apellido_paterno, row.apellido_materno].filter(Boolean).join(' ').trim())
    }
  }

  const actorAccounts = Array.from(new Set(selected.map((row) => String(row.actor_email || '').toLowerCase()).filter(Boolean))).slice(0, 180)
  const staffProfiles = await loadAuditStaffProfiles(actorAccounts)

  const changes: any[] = []
  for (const row of selected) {
    const payload = safePayload(row.payload)
    const hasDiff = Array.isArray(payload.changes)
    const isDuplicateLegacy = !hasDiff && detailedKeys.has([row.matricula, row.actor_email, String(row.recorded_at || '').slice(0, 16)].join('|'))
    if (isDuplicateLegacy) continue
    const fields = hasDiff ? payload.changes : (Array.isArray(payload.fields)
      ? payload.fields.map((field: unknown) => ({ field, before: null, after: null }))
      : [])
    if (!fields.length) continue
    const sourceFlow = String(row.source_flow || '')
    const source = /husky|family|familia/i.test(sourceFlow) ? 'Husky Pass'
      : /aurora|matricula_overlay|student_patch|control_escolar_csv/i.test(sourceFlow) ? 'Aurora' : 'Otro'
    const matricula = String(row.matricula || '').toUpperCase()
    const actorEmail = String(row.actor_email || '').trim().toLowerCase()
    const recordedActor = String(row.actor_name || '').trim()
    const actor = source === 'Aurora' && (!recordedActor || recordedActor.toLowerCase() === actorEmail.toLowerCase())
      ? staffProfiles.get(actorEmail.toLowerCase())?.name || recordedActor || actorEmail || 'Aurora'
      : recordedActor || (source === 'Husky Pass' ? 'Husky Pass · Familia' : actorEmail || 'Sin identificar')
    for (let i = 0; i < fields.length; i++) {
      const change = fields[i] || {}
      const field = String(change.field || '').slice(0, 90)
      if (!field) continue
      changes.push({
        id: String(row.id) + ':' + i,
        eventId: Number(row.id),
        date: String(row.recorded_at || '').slice(0, 10),
        recordedAt: String(row.recorded_at || ''),
        matricula,
        student: nameByMatricula.get(matricula) || matricula,
        field,
        fieldLabel: fieldLabel(field),
        category: fieldCategory(field),
        before: hasDiff ? safeValue(change.before) : null,
        after: hasDiff ? safeValue(change.after) : null,
        source,
        actor,
        actorEmail,
        avatar: source === 'Aurora' && isCasitaWorkspaceEmail(actorEmail)
          ? staffProfiles.get(actorEmail)?.avatar || buildWorkspacePhotoUrl(actorEmail, actor)
          : cleanAuditAvatar(payload.avatar),
        flow: sourceFlow,
        quality: hasDiff ? 'verified' : 'historical',
        plantel: String(row.plantel || ''),
        ciclo: String(row.ciclo || '')
      })
    }
  }
  return {
    categories: CATEGORIES,
    allowedPlanteles: allowed.filter(item => PLANTELES_LIST.includes(item)),
    events: changes,
    truncated,
    systems: ['Aurora', 'Husky Pass', 'Otro'],
    sources: { ledger: 'control_escolar_audit_events', legacyValuesIncomplete: true },
    generatedAt: new Date().toISOString()
  }
})
