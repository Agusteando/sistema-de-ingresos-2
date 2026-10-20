import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import ts from 'typescript'
const timeline=readFileSync(new URL('../shared/utils/auditTimeline.ts',import.meta.url),'utf8').replace(/export /g,'')
const recovery=readFileSync(new URL('../shared/utils/auditRecovery.mjs',import.meta.url),'utf8').replace(/export /g,'')
const caseBundle=JSON.parse(readFileSync(new URL('./fixtures/audit-recovery-pm1626.json',import.meta.url),'utf8'))
const util=readFileSync(new URL('../server/utils/audit-change-events.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
const handler=readFileSync(new URL('../server/api/control-escolar/audit/field-history.get.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export default defineEventHandler','globalThis.handler=defineEventHandler')
const row=(id,field='grupo',at='2025-01-02 12:00:00')=>({id,matricula:'PT0123',plantel:'PT',recorded_at:at,cursor_at:at+'.000123',actor_name:'Erika Ramos',actor_email:'erika@casitaiedis.edu.mx',source_flow:'aurora',payload:JSON.stringify({changes:[{field,before:'A',after:'B'}]})})
function setup({rows=[row(2)],recoveries=[],studentRow=null,query={},history=async()=>({events:[],available:true,partial:false,truncated:false}),user={hasControlEscolarRole:true,plantelesList:['PT']},failDb=false}={}){
 const calls=[],historyCalls=[]
 const ctx=createContext({Intl,Date,Buffer,getCentralTableColumns:async()=>new Set(['grupo']),console:{warn(){}},PLANTELES_LIST:['PT','PM'],getTrustedAuthUser:async()=>user,normalizePlantel:v=>String(v||'').toUpperCase(),getQuery:()=>({matricula:'PT0123',plantel:'PT',field:'grupo',...query}),setResponseHeader(){},defineEventHandler:fn=>fn,createError:v=>Object.assign(new Error(v.message),v),loadAuditStaffProfiles:async()=>new Map(),isCasitaWorkspaceEmail:()=>false,buildWorkspacePhotoUrl:()=>'',cleanAuditAvatar:()=>'',loadHistoricalActions:async args=>{historyCalls.push(args);return history(args)},controlEscolarCentralQuery:async(sql,params)=>{calls.push({sql,params});if(failDb)throw new Error('db down');if(sql.includes("event_type = 'student_update_recovery'"))return recoveries;return sql.includes('FROM matricula')?[studentRow||{matricula:'PT0123',nombres:'Ana María',apellido_paterno:'García',apellido_materno:'López',audit_current_value:'B'}]:rows}})
 runInContext(ts.transpile(timeline+'\n'+recovery+'\n'+util+'\n'+handler,{target:ts.ScriptTarget.ES2022}),ctx)
 return {build:async records=>{ctx.forensicRows=records;return runInContext('buildAuditChanges(forensicRows)',ctx)},invoke:()=>ctx.handler({context:{auroraRequestId:'field-test'}}),calls,historyCalls}
}
test('all-time exact-field history contains full names, values and actors; includes older years and ignores grid filters',async()=>{
 const s=setup({rows:[row(3,'grado'),row(2,'lugar_trabajo_padre'),row(1,'lugarTrabajoPadre','2024-01-02 12:00:00')],query:{field:'lugarTrabajoPadre',from:'2026-10-15',source:'Husky Pass'}}),r=await s.invoke()
 assert.equal(r.events.length,2);assert.equal(r.events[0].student,'Ana María García López');assert.equal(r.events[0].actor,'Erika Ramos');assert.equal(r.events[1].recordedAt,'2024-01-02 12:00:00');assert.equal(r.events[0].before,'A');assert.equal(r.events[0].after,'B')
 assert.deepEqual(Array.from(s.calls[0].params),['PT','PT0123']);assert.equal(s.calls[0].sql.includes('created_at >='),false)
 assert.equal(s.historyCalls[0].fullHistory,true);assert.equal(s.historyCalls[0].matricula,'PT0123')
})
test('denies financial-only and unauthorized/mismatched campus requests before data access',async()=>{
 for(const args of [{user:{plantelesList:['PT']}},{query:{plantel:'PM'}},{query:{matricula:'PM0637'}}]){const s=setup(args);await assert.rejects(s.invoke(),e=>e.statusCode===403);assert.equal(s.calls.length,0);assert.equal(s.historyCalls.length,0)}
})
test('rejects invalid field, SQL-like matrícula and malformed cursor',async()=>{
 for(const query of [{field:"grupo' OR 1=1"},{matricula:"PT0123' OR 1=1"},{cursor:'bad'}]){const s=setup({query});await assert.rejects(s.invoke(),e=>e.statusCode===400);assert.equal(s.calls.length,0)}
})
test('keyset pagination retains sub-second timestamp and id, binds the cursor to student/field, and never refetches historical source on next page',async()=>{
 const rows=Array.from({length:501},(_,i)=>row(1000-i))
 const first=await setup({rows}).invoke();assert.ok(first.nextCursor)
 const cursor=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString());assert.equal(cursor.at,'2025-01-02 12:00:00.000123');assert.equal(cursor.id,'501')
 const second=setup({query:{cursor:first.nextCursor}});await second.invoke();assert.deepEqual(Array.from(second.calls[0].params).slice(-3),[cursor.at,cursor.at,'501']);assert.equal(second.historyCalls.length,0)
 const wrong=setup({query:{cursor:first.nextCursor,field:'grado'}});await assert.rejects(wrong.invoke(),e=>e.statusCode===400)
})
test('historical source failure retains ledger changes with explicit partial state and reference',async()=>{
 const r=await setup({history:async()=>{throw new Error('source unavailable')}}).invoke();assert.equal(r.events.length,1);assert.equal(r.partial,true);assert.equal(r.historyUnavailable,true);assert.equal(r.requestId,'field-test')
})
test('database failure returns retryable traceable 503, never successful empty history',async()=>{
 await assert.rejects(setup({failDb:true}).invoke(),e=>e.statusCode===503&&e.data.code==='AUDIT_FIELD_HISTORY_UNAVAILABLE'&&e.data.requestId==='field-test')
})
test('full field history never discards distinct writes merely because actors/timestamps are close',async()=>{
 const legacy={...row(1),payload:JSON.stringify({fields:['grupo']})}
 const historical={id:'source-evidence',eventId:0,field:'grupo',matricula:'PT0123',source:'Aurora',actor:'Erika Ramos',actorEmail:'erika@casitaiedis.edu.mx',recordedAt:'2025-01-02 12:00:01',quality:'historical',before:null,after:null}
 const r=await setup({rows:[row(2),legacy],history:async()=>({events:[historical],available:true,partial:false,truncated:false})}).invoke()
 assert.equal(r.events.length,3);assert.ok(r.events.some(e=>e.id==='source-evidence'));assert.ok(r.events.some(e=>e.id==='1:0'))
})

test('orders same-second writes by retained microseconds, then insertion id without losing values',async()=>{
 const first=row(9,'grupo','2026-10-19 09:03:01.123001')
 const last=row(10,'grupo','2026-10-19 09:03:01.123999')
 const result=await setup({rows:[first,last]}).invoke()
 assert.deepEqual(Array.from(result.events,e=>e.eventId),[10,9])
 assert.ok(result.events.every(e=>e.before==='A'&&e.after==='B'))
})
test('transaction payload retains precise write time even when legacy created_at has seconds only',async()=>{
 const precise=row(10);precise.payload=JSON.stringify({recordedAt:'2025-01-02 12:00:00.123456',changes:[{field:'grupo',before:'OCEANÍA',after:'ÁFRICA'}]})
 const result=await setup({rows:[precise]}).invoke()
 assert.equal(result.events[0].recordedAt,'2025-01-02 12:00:00.123456')
})

test('current value comes from the authorized student row rather than assuming the last event is current',async()=>{
 const s=setup(),result=await s.invoke()
 assert.equal(result.currentValueAvailable,true);assert.equal(result.currentValue,'B')
 assert.ok(s.calls.some(c=>c.sql.includes('`grupo` AS audit_current_value')&&c.params[0]==='PT0123'))
 const unavailable=await setup({query:{field:'grado'}}).invoke()
 assert.equal(unavailable.currentValueAvailable,false);assert.equal(unavailable.currentValue,null)
})
test('stored phase returns current value and committed changes without contacting historical backend',async()=>{
 const s=setup({query:{phase:'stored'},history:async()=>{throw Error('unreachable')}}),result=await s.invoke()
 assert.equal(s.historyCalls.length,0);assert.equal(result.currentValue,'B');assert.equal(result.events[0].after,'B');assert.equal(result.partial,false)
})

test('default ledger projection retains separate same-minute legacy evidence instead of guessing duplicates',async()=>{
 const legacy={...row(1),payload:JSON.stringify({fields:['grupo']})}
 const events=await setup().build([row(2),legacy])
 assert.equal(events.length,2);assert.equal(events[0].quality,'verified');assert.equal(events[1].quality,'historical')
})

test('PM1626 real source evidence powers the stored field API while preserving original data and actor',async()=>{
 const original={...row(5629),event_type:'student_update',matricula:'PM1626',plantel:'PM',recorded_at:'2026-10-14 13:59:53.000000',actor_name:'Erika Ramos Escalera',payload:JSON.stringify({fields:['grupo']})}
 const recoveryRow={id:9000,event_type:'student_update_recovery',matricula:'PM1626',plantel:'PM',payload:JSON.stringify({originalEventId:'5629',sourceRecord:caseBundle.records[0],fingerprint:'case-source'})}
 const recent=(id,time,before,after)=>({...row(id),event_type:'student_update',matricula:'PM1626',plantel:'PM',recorded_at:'2026-10-19 '+time,payload:JSON.stringify({changes:[{field:'grupo',before,after}]})})
 const before=original.payload
 const s=setup({rows:[recent(5749,'09:15:54.000000','','ANTÁRTIDA'),recent(5747,'09:15:47.000000','AMÉRICA',''),original],recoveries:[recoveryRow],studentRow:{matricula:'PM1626',nombres:'Josue Emiliano',apellido_paterno:'Garcia',apellido_materno:'Jardon',audit_current_value:'ANTÁRTIDA'},query:{matricula:'PM1626',plantel:'PM',field:'grupo',phase:'stored'},user:{isSuperAdmin:true,plantelesList:['PM']}})
 const result=await s.invoke(),restored=result.events.find(event=>event.eventId===5629)
 assert.equal(restored.before,'ANTÁRTIDA');assert.equal(restored.after,'AMÉRICA')
 assert.equal(restored.actor,'Erika Ramos Escalera');assert.equal(restored.quality,'verified')
 assert.equal(restored.student,'Josue Emiliano Garcia Jardon')
 assert.equal(restored.recovery.file,'mysql-bin.000335');assert.equal(restored.recovery.position,'500848402')
 assert.equal(restored.recovery.actorEvidence,'existing-audit-record')
 assert.equal(result.events.length,3);assert.equal(result.currentValue,'ANTÁRTIDA');assert.equal(original.payload,before)
 assert.equal(s.historyCalls.length,0)
})

test('unattributed recovered writes retain their source evidence and never borrow an actor',async()=>{
 const entry={...row(9001),event_type:'student_update',matricula:'PM1626',plantel:'PM',recorded_at:'2026-10-14 13:59:53.000000',actor_name:'Sin identificar',actor_email:'',source_flow:'mysql_binlog_recovered',payload:JSON.stringify({recoveryVersion:1,fingerprint:'source-fixture',sourceRecord:caseBundle.records[0],changes:[{field:'grupo',before:'ANTÁRTIDA',after:'AMÉRICA'}]})}
 const result=await setup().build([entry])
 assert.equal(result[0].before,'ANTÁRTIDA');assert.equal(result[0].after,'AMÉRICA');assert.equal(result[0].actor,'Sin identificar');assert.equal(result[0].source,'Otro');assert.equal(result[0].recovery.actorEvidence,'unresolved');assert.equal(result[0].recovery.position,'500848402')
})


test('audit separates CURP/photo/status and excludes grade without moving it to Other',async()=>{
 const excluded=['grado','nivel','ciclo','lastGrade','lastCiclo']
 const retained=['grupo','nombres','telefono_padre','lugarTrabajoMadre','curp','curp_padre','foto','estatus','baja']
 const records=[...excluded,...retained].map((field,i)=>row(i+1,field))
 const original=JSON.stringify(records)
 const events=await setup().build(records)
 assert.deepEqual(Array.from(events,e=>e.field),retained)
 assert.deepEqual(Array.from(events,e=>e.category),['grupo','nombre','contacto','trabajo','curp','curp','foto','estatus','estatus'])
 assert.equal(JSON.stringify(records),original)
})
