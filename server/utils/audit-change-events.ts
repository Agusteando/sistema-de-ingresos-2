import {canonicalRecoveryField,indexAuditRecoveries,validateBinlogRecovery} from '~/shared/utils/auditRecovery.mjs'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail } from './google-workspace-directory'
import { cleanAuditAvatar, loadAuditStaffProfiles } from './audit-actor-profile'

export const CATEGORIES = [
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
  foto: 'Foto', grupo: 'Grupo', grado: 'Grado', nivel: 'Nivel', ciclo: 'Ciclo',
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

export const canonicalAuditField=(value:unknown)=>canonicalRecoveryField(value)

export const buildAuditChanges=async(selected:any[],_preserveAllRecords=false)=>{
  const keys = Array.from(new Set(selected.map((row) => String(row.matricula || '').toUpperCase()).filter(Boolean)))
  const recoveryRows=keys.length?await controlEscolarCentralQuery<any[]>(
    "SELECT id,event_type,matricula,plantel,payload FROM control_escolar_audit_events WHERE event_type = 'student_update_recovery' AND matricula IN ("+keys.map(()=>'?').join(',')+") LIMIT 10001",keys):[]
  if(recoveryRows.length>10000)throw Object.assign(new Error('Recovery evidence query limit reached'),{code:'AUDIT_RECOVERY_LIMIT'})
  const recovered=indexAuditRecoveries(selected,recoveryRows)
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
    const standalone=payload.recoveryVersion===1&&payload.sourceRecord?validateBinlogRecovery(payload.sourceRecord):null
    if(standalone&&(standalone.matricula!==String(row.matricula||'').toUpperCase()||standalone.recordedAt!==String(row.recorded_at||'').slice(0,19)))throw Object.assign(new Error('Recovered source identity/time mismatch'),{code:'AUDIT_RECOVERY_LINK_CONFLICT'})
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
      const recovery=recovered.get(String(row.id)+'|'+canonicalRecoveryField(field))||(standalone&&canonicalRecoveryField(standalone.field)===canonicalRecoveryField(field)?{...standalone,originalEventId:null,recoveryEventId:String(row.id),fingerprint:payload.fingerprint,actorEvidence:'unresolved'}:null)
      changes.push({
        id: String(row.id) + ':' + i,
        eventId: Number(row.id),
        date: String(row.recorded_at || '').slice(0, 10),
        recordedAt: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(String(payload.recordedAt || '')) ? String(payload.recordedAt) : String(row.recorded_at || ''),
        matricula,
        student: nameByMatricula.get(matricula) || matricula,
        field,
        fieldLabel: fieldLabel(field),
        category: fieldCategory(field),
        before: recovery ? recovery.before : hasDiff ? safeValue(change.before) : null,
        after: recovery ? recovery.after : hasDiff ? safeValue(change.after) : null,
        source,
        actor,
        actorEmail,
        avatar: source === 'Aurora' && isCasitaWorkspaceEmail(actorEmail)
          ? staffProfiles.get(actorEmail)?.avatar || buildWorkspacePhotoUrl(actorEmail, actor)
          : cleanAuditAvatar(payload.avatar),
        flow: sourceFlow,
        quality: hasDiff || recovery ? 'verified' : 'historical',
        ...(recovery?{recovery:{...recovery.evidence,originalEventId:recovery.originalEventId,recoveryEventId:recovery.recoveryEventId,fingerprint:recovery.fingerprint,actorEvidence:recovery.actorEvidence||'existing-audit-record'}}:{}),
        plantel: String(row.plantel || ''),
        ciclo: String(row.ciclo || '')
      })
    }
  }
  return changes
}
