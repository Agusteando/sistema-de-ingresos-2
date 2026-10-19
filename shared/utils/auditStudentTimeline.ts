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
