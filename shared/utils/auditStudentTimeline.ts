import { compareAuditNewest } from './auditTimeline.ts'
export type AuditStudentEvent = {id:string;matricula:string;plantel:string;student:string;recordedAt:string;eventId:number;quality:string}
export const groupAuditStudents = <T extends AuditStudentEvent>(records:T[]) => {
  const groups=new Map<string,{key:string;student:string;matricula:string;plantel:string;changes:T[];observations:T[];latest:T}>()
  for(const record of [...records].sort(compareAuditNewest)){
    const key=record.plantel+'|'+(record.matricula||record.id)
    let group=groups.get(key)
    if(!group){group={key,student:record.student,matricula:record.matricula,plantel:record.plantel,changes:[],observations:[],latest:record};groups.set(key,group)}
    if(record.student&&record.student.toUpperCase()!==record.matricula.toUpperCase())group.student=record.student
    if(record.quality==='verified')group.changes.push(record)
    else group.observations.push(record)
  }
  for(const group of groups.values())group.latest=group.changes[0]||group.observations[0]
  return [...groups.values()].sort((a,b)=>compareAuditNewest(a.latest,b.latest))
}
export type AuditStudentRecord = AuditStudentEvent & {quality:'verified'|'historical';actor:string;source:string;avatar:string;actorEmail:string;field:string;fieldLabel:string;category:string;before:string|null;after:string|null;date:string;flow:string;ciclo:string;combinedEvents?:AuditStudentRecord[]}
export const groupAuditDates = <T extends AuditStudentEvent>(records:T[],focusedDate?:string) => {
  const days=new Map<string,T[]>()
  for(const record of records){const date=record.recordedAt.slice(0,10);if(!days.has(date))days.set(date,[]);days.get(date)!.push(record)}
  if(focusedDate&&!days.has(focusedDate))days.set(focusedDate,[])
  return [...days].sort(([a],[b])=>b.localeCompare(a)).map(([date,events])=>({date,events:[...events].sort(compareAuditNewest)}))
}
export const auditRecordNoun=(records:{quality:string}[])=>records.every(record=>record.quality==='verified')?(records.length===1?'cambio':'cambios'):(records.length===1?'registro':'registros')
