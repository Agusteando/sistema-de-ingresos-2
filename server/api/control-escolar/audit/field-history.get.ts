import { compareAuditNewest } from '~/shared/utils/auditTimeline'
import { getQuery, setResponseHeader } from 'h3'
import { PLANTELES_LIST } from '../../../../utils/constants'
import { getTrustedAuthUser, normalizePlantel } from '../../../utils/auth-session'
import { controlEscolarCentralQuery, getCentralTableColumns } from '../../../utils/control-escolar-central'
import { buildAuditChanges, canonicalAuditField } from '../../../utils/audit-change-events'
import { loadHistoricalActions } from '../../../utils/historical-student-audit'
import { loadAuditStaffProfiles } from '../../../utils/audit-actor-profile'

export default defineEventHandler(async event=>{
  setResponseHeader(event,'Cache-Control','private, no-store')
  const user=await getTrustedAuthUser(event)
  if(!user.isSuperAdmin&&!user.hasControlEscolarRole)throw createError({statusCode:403,message:'Acceso restringido.'})
  const query=getQuery(event)
  const plantel=normalizePlantel(query.plantel)
  const allowed=user.isSuperAdmin?PLANTELES_LIST:user.plantelesList.filter(p=>PLANTELES_LIST.includes(p))
  if(!allowed.includes(plantel))throw createError({statusCode:403,message:'Plantel no autorizado.'})
  const matricula=String(query.matricula||'').trim().toUpperCase()
  const field=canonicalAuditField(query.field)
  if(!/^[A-Z]{1,6}\d{2,8}$/.test(matricula)||!field||field.length>90||!/^[a-z0-9]+$/.test(field))throw createError({statusCode:400,message:'Campo o alumno inválido.'})
  const inferred=matricula.match(/^[A-Z]+/)?.[0]||''
  if((['PMA','PMB'].includes(inferred)?'PM':inferred)!==plantel)throw createError({statusCode:403,message:'Plantel no autorizado.'})
  let cursor:{at:string;id:string;scope:string}|null=null
  if(query.cursor){
    try{cursor=JSON.parse(Buffer.from(String(query.cursor),'base64url').toString());if(!cursor||cursor.scope!==[plantel,matricula,field].join('|')||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(cursor.at)||!/^\d+$/.test(cursor.id))throw Error('cursor')}
    catch{throw createError({statusCode:400,message:'Página inválida.'})}
  }
  const requestId=String(event.context.auroraRequestId||'')
  try{
    // Cursor traverses raw events so an event with many fields is never split or skipped.
    const where=cursor?' AND (created_at < ? OR (created_at = ? AND id < ?))':''
    const rows=await controlEscolarCentralQuery<any[]>(
      "SELECT id,matricula,plantel,ciclo,actor_email,actor_name,source_flow,payload,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS recorded_at,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS cursor_at FROM control_escolar_audit_events WHERE event_type = 'student_update' AND plantel = ? AND matricula = ?"+where+' ORDER BY created_at DESC,id DESC LIMIT 501',
      [plantel,matricula,...(cursor?[cursor.at,cursor.at,cursor.id]:[])]
    )
    const page=rows.slice(0,500)
    const ledger=(await buildAuditChanges(page,true)).filter(e=>canonicalAuditField(e.field)===field)
    const last=page.at(-1)
    const nextCursor=rows.length>500&&last?Buffer.from(JSON.stringify({at:last.cursor_at,id:String(last.id),scope:[plantel,matricula,field].join('|')})).toString('base64url'):null
    let historical:any[]=[]
    let partial=false
    let historyUnavailable=false
    if(!cursor&&query.phase!=='stored'){
      try{
        const result=await loadHistoricalActions({from:new Date(0),to:new Date(),planteles:[plantel],matricula,fullHistory:true})
        historical=result.events.filter(e=>e.matricula===matricula&&canonicalAuditField(e.field)===field)
        partial=result.partial||result.truncated||!result.available
        if(partial)console.warn('[audit-field-history] incomplete source',{requestId,available:result.available,truncated:result.truncated,checked:result.checked,unmatched:result.unmatched})
      }catch(error:any){
        partial=true;historyUnavailable=true
        console.warn('[audit-field-history] historical source failed',{requestId,code:String(error?.cause?.code||error?.code||''),message:String(error?.message||error)})
      }
    }
    const columns=field==='grupo'?new Set(['grupo']):await getCentralTableColumns('matricula').catch(()=>new Set<string>())
    const currentColumn=[...columns].find(column=>canonicalAuditField(column)===field&&!/foto|adjunt|ine|curp|password|token/i.test(column))
    const currentSelection=currentColumn?', `'+currentColumn.replace(/`/g,'``')+'` AS audit_current_value':''
    const names=await controlEscolarCentralQuery<any[]>('SELECT matricula,nombres,apellido_paterno,apellido_materno'+currentSelection+' FROM matricula WHERE UPPER(matricula) = ?',[matricula])
    const currentValueAvailable=Boolean(currentColumn&&names.length)
    const currentValue=currentValueAvailable&&names[0].audit_current_value!=null?String(names[0].audit_current_value).trim().slice(0,500):null
    const student=[names[0]?.nombres,names[0]?.apellido_paterno,names[0]?.apellido_materno].filter(Boolean).join(' ').trim()
    const profiles=await loadAuditStaffProfiles([...new Set(historical.filter(e=>e.source==='Aurora').map(e=>String(e.actorEmail||'')))])
    for(const e of historical){e.student=student;const profile=profiles.get(String(e.actorEmail||'').toLowerCase());if(profile){e.actor=profile.name||e.actor;e.avatar=profile.avatar||''}}
    const events=[...ledger,...historical]
    events.sort(compareAuditNewest)
    return {events,nextCursor,partial,historyUnavailable,requestId,student,field,plantel,matricula,currentValueAvailable,currentValue}
  }catch(error:any){
    console.warn('[audit-field-history] query failed',{requestId,code:String(error?.cause?.code||error?.code||''),message:String(error?.message||error)})
    throw createError({statusCode:503,message:'No se pudo cargar el historial del campo.',data:{requestId,code:'AUDIT_FIELD_HISTORY_UNAVAILABLE',retryable:true}})
  }
})
