import { compareAuditNewest } from './auditTimeline.ts'
type Transition={id:string;eventId:number;recordedAt:string;matricula:string;plantel:string;field:string;quality:string;source:string;actor:string;actorEmail?:string;before:string|null;after:string|null;combinedEvents?:Transition[];relatedEventId?:number}
const person=(record:Transition)=>record.actorEmail?.trim()?record.actorEmail.trim().toLowerCase():record.actor?.trim()&&!/^(Aurora|Sin identificar)$/i.test(record.actor.trim())?'name:'+record.actor.trim():''
const isGroup=(field:string)=>/^(grupo|group)$/i.test(field)
const millis=(at:string)=>Date.parse(at.replace(' ','T')+'-06:00')
const fieldKey=(field:string)=>field.replace(/[_\s-]/g,'').toLowerCase().replace(/^group$/,'grupo')
export const reconcileAuditMirrors=<T extends Transition>(records:T[]):T[]=>{
  // Only an explicit source event id can enrich a stored observation. Never join
  // students, actors or writes by time proximity.
  const evidence=new Map<string,T[]>()
  const link=(id:number,record:T)=>[id,record.plantel,record.matricula,record.source,fieldKey(record.field)].join('|')
  for(const source of records)if(source.relatedEventId&&source.quality==='verified'){
    const key=link(source.relatedEventId,source)
    evidence.set(key,[...(evidence.get(key)||[]),source])
  }
  records=records.map(record=>{
    if(record.eventId<=0||record.quality==='verified')return record
    const matches=evidence.get(link(record.eventId,record))||[]
    if(!matches.length||matches.some(source=>source.before!==matches[0].before||source.after!==matches[0].after))return record
    return {...record,before:matches[0].before,after:matches[0].after,quality:'verified',sourceEvidence:matches.map(source=>source.id)}
  })
  const ledger=new Map(records.filter(record=>record.eventId>0&&record.quality==='verified').map(record=>[[record.eventId,record.plantel,record.matricula,fieldKey(record.field)].join('|'),record]))
  return records.filter(record=>{
    if(!record.relatedEventId)return true
    const original=ledger.get([record.relatedEventId,record.plantel,record.matricula,fieldKey(record.field)].join('|'))
    return !original||original.source!==record.source||original.before!==record.before||original.after!==record.after
  })
}
// Presentation only. Keep the original writes, including their ids, values and times.
export const compactAuditTransitions=<T extends Transition>(records:T[]):T[]=>{
  const result:T[]=[],last=new Map<string,number>()
  for(const record of reconcileAuditMirrors(records).sort(compareAuditNewest).reverse()){
    const key=record.plantel+'|'+record.matricula,index=last.get(key)
    const previous=index===undefined?undefined:result[index]
    const gap=previous?millis(record.recordedAt)-millis(previous.recordedAt):NaN
    const ordered=previous&&(gap>0||(gap===0&&previous.eventId>0&&record.eventId>previous.eventId))
    if(previous&&index!==undefined&&record.quality==='verified'&&previous.quality==='verified'&&
       !record.combinedEvents&&!previous.combinedEvents&&isGroup(previous.field)&&isGroup(record.field)&&
       previous.source===record.source&&previous.source==='Aurora'&&person(record)&&person(record)===person(previous)&&
       previous.recordedAt.slice(0,10)===record.recordedAt.slice(0,10)&&ordered&&gap<=60000&&
       previous.before!==null&&previous.before!==''&&previous.after===''&&record.before===''&&record.after!==null&&record.after!==''&&record.after!==previous.before){
      result[index]={...record,before:previous.before,combinedEvents:[previous,record]}
    }else{
      result.push(record)
      if(record.quality==='verified')last.set(key,result.length-1)
    }
  }
  return result.sort(compareAuditNewest)
}
