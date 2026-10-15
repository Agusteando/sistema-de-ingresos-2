import { getQuery, setResponseHeader } from 'h3'
import { PLANTELES_LIST } from '../../../../utils/constants'
import { getTrustedAuthUser, normalizePlantel } from '../../../utils/auth-session'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { loadHistoricalActions } from '../../../utils/historical-student-audit'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail } from '../../../utils/google-workspace-directory'

const dateFormat = /^\d{4}-\d{2}-\d{2}$/
const todayMexico = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Mexico_City', year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date())
  const value = (type: string) => parts.find(x => x.type===type)?.value || ''
  return value('year') + '-' + value('month') + '-' + value('day')
}
const dateShift = (date: string, shift: number) => {
  const value = new Date(date + 'T12:00:00Z')
  value.setUTCDate(value.getUTCDate() + shift)
  return value.toISOString().slice(0,10)
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event,'Cache-Control','private, no-store')
  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin && !user.hasControlEscolarRole) throw createError({statusCode:403,message:'Acceso restringido.'})
  const query = getQuery(event)
  const allowed = user.isSuperAdmin ? PLANTELES_LIST : user.plantelesList.filter(x=>PLANTELES_LIST.includes(x))
  const requested = normalizePlantel(query.plantel)
  if (requested && requested !== 'ALL' && !allowed.includes(requested)) throw createError({statusCode:403,message:'Plantel no autorizado.'})
  const planteles = requested && requested !== 'ALL' ? [requested] : allowed
  if (!planteles.length) throw createError({statusCode:403,message:'Plantel no autorizado.'})
  const today = todayMexico()
  const to = String(query.to || today)
  const from = String(query.from || dateShift(to,-6))
  if (!dateFormat.test(from) || !dateFormat.test(to) || from > to) throw createError({statusCode:400,message:'Fechas inválidas.'})
  const fromDate = new Date(from + 'T00:00:00-06:00')
  const toDate = new Date(to + 'T23:59:59.999-06:00')
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || toDate.getTime()-fromDate.getTime()>93*86400000)
    throw createError({statusCode:400,message:'Selecciona un periodo de hasta 90 días.'})
  try {
    const history = await loadHistoricalActions({from:fromDate,to:toDate,planteles})
    const events = history.events
    const keys = Array.from(new Set(events.map(x=>x.matricula))).slice(0,5000)
    const names = new Map<string,string>()
    for (let i=0;i<keys.length;i+=200){
      const part=keys.slice(i,i+200)
      const rows=await controlEscolarCentralQuery<any[]>(
        'SELECT matricula,nombres,apellido_paterno,apellido_materno FROM matricula WHERE UPPER(matricula) IN (' + part.map(()=>'?').join(',') + ')',part
      ).catch(()=>[])
      for(const row of rows) names.set(String(row.matricula||'').toUpperCase(),
        [row.nombres,row.apellido_paterno,row.apellido_materno].filter(Boolean).join(' ').trim())
    }
    const staffEmails = Array.from(new Set(events.filter(e=>e.source==='Aurora' && isCasitaWorkspaceEmail(e.actorEmail))
      .map(e=>e.actorEmail.toLowerCase()))).slice(0,200)
    const staffNames=new Map<string,string>()
    if (staffEmails.length) {
      try {
        const profileRows=await controlEscolarCentralQuery<any[]>(
          'SELECT email, displayName FROM users WHERE LOWER(email) IN (' + staffEmails.map(()=>'?').join(',') + ')',
          staffEmails
        )
        for (const profile of profileRows) {
          const name=String(profile.displayName||'').trim()
          if(name) staffNames.set(String(profile.email||'').toLowerCase(),name)
        }
      } catch (error:any) {
        console.info('[historical-student-audit] School staff profiles unavailable', {code:String(error?.code||'')})
      }
    }
    for(const record of events){
      record.student=names.get(record.matricula)||record.matricula
      if(record.source==='Aurora' && isCasitaWorkspaceEmail(record.actorEmail)){
        record.actor=staffNames.get(record.actorEmail.toLowerCase())||record.actor
        record.avatar=buildWorkspacePhotoUrl(record.actorEmail,record.actor)
      }
    }
    return {events,available:history.available,truncated:history.truncated}
  } catch(error:any) {
    console.warn('[historical-student-audit] query unavailable', {code:String(error?.code||''),message:String(error?.message||error)})
    return {events:[],available:false,truncated:false}
  }
})
