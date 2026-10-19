import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import {createHash} from 'node:crypto'
import ts from 'typescript'
const source=readFileSync(new URL('../server/utils/historical-student-audit.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022})+'\nglobalThis.api={queryLoki,parseMessage,parseConsoleBlock,loadHistoricalActions,allowedLokiUrl};'
const at='2026-09-30T01:03:35.120Z'
const ns=String(BigInt(new Date(at).getTime())*1000000n)
const hash=v=>createHash('sha256').update(String(v)).digest('hex').slice(0,12)
// Actual event shape and hashes supplied in the PM0637 investigation.
const family={level:'info',at,message:'credentialization.submission.database-committed',requestId:'c5ef59c2-2c4d-422e-8052-9e87d921e3bb',userId:{hash:'e428a291b4cc'},matricula:{hash:'ef7d3cabb351'},created:false}
const school={level:'info',message:'matricula audited write',matricula:'PT123',actor:'erika@casitaiedis.edu.mx',changedFields:['grupo']}
const payload=(records,labels={container_name:'app-husky-pass'})=>({status:'success',data:{result:records.length?[{stream:labels,values:records.map(item=>[ns,JSON.stringify(item)])}]:[]}})
function setup(responder,query=async(sql)=>sql.includes('FROM matricula')?[{matricula:'PM0637'},{matricula:'PT123'}]:[]){
 const calls=[]
 const ctx=createContext({createHash,URL,URLSearchParams,AbortSignal,Buffer,Date,Intl,process:{env:{}},console:{info(){},warn(){}},controlEscolarCentralQuery:query,
 fetch:async(url)=>{const selector=url.searchParams.get('query');calls.push(selector);const data=await responder(selector,calls.length);return {ok:true,json:async()=>data}}})
 runInContext(js,ctx)
 return {...ctx.api,calls,env:ctx.process.env}
}
const from=new Date('2026-09-29T06:00:00Z'),to=new Date('2026-09-30T05:59:59Z')
test('combines Aurora and Husky Pass across label families instead of returning the first source',async()=>{
 const s=setup(q=>q.startsWith('{container_name=')?payload([school],{container_name:'app-aurora'}):q.startsWith('{container=')?payload([family],{container:'app-husky-pass'}):payload([]))
 const r=await s.loadHistoricalActions({from,to,planteles:['PT','PM']})
 assert.equal(r.events.length,2)
 assert.deepEqual(Array.from(new Set(r.events.map(e=>e.source))).sort(),['Aurora','Husky Pass'])
 assert.equal(r.events.find(e=>e.source==='Husky Pass').matricula,'PM0637')
 assert.equal(s.calls.length,3)
 assert.ok(s.calls.every(q=>q.includes('.*(husky-pass|aurora|sistema-de-ingresos).*')))
})
test('recovers actual matrícula hashes even when the student has no matching users account',async()=>{
 assert.equal(hash('PM0637'),'ef7d3cabb351')
 const s=setup(()=>payload([family]))
 const r=await s.loadHistoricalActions({from,to,planteles:['PM']})
 assert.equal(r.events.length,1)
 assert.equal(r.events[0].date,'2026-09-29')
 assert.equal(r.events[0].before,null)
 assert.equal(r.events[0].quality,'historical')
 assert.equal(r.events[0].actor,'Husky Pass · Familia')
})
test('does not lose later label families or returned events when a selector fails',async()=>{
 const s=setup((q,i)=>{if(i===1)throw new TypeError('network unavailable');return payload([family])})
 const r=await s.queryLoki(from,to)
 assert.equal(r.records.length,1)
 assert.equal(r.partial,true)
 assert.equal(s.calls.length,3)
})
test('total upstream failure stays unavailable rather than becoming an empty successful result',async()=>{
 const s=setup(()=>{throw new Error('source unavailable')})
 await assert.rejects(s.queryLoki(from,to),/source unavailable/)
})
test('campus permissions exclude resolved records from other campuses',async()=>{
 const s=setup(()=>payload([family]))
 assert.equal((await s.loadHistoricalActions({from,to,planteles:['PT']})).events.length,0)
})
test('extracts the real actor email from console-style and structured actor logs for Workspace portraits',()=>{
 const s=setup(()=>payload([]))
 const plain="[Control Escolar] matricula audited write { matricula: 'PT123', actor: 'erika@casitaiedis.edu.mx', changedFields: ['grupo'] }"
 assert.equal(s.parseMessage(plain,ns,{}).actorEmail,'erika@casitaiedis.edu.mx')
 assert.equal(s.parseMessage(JSON.stringify({...school,actor:{name:'Erika',email:'erika@casitaiedis.edu.mx'}}),ns,{}).actor,'Erika')
 assert.equal(s.parseMessage(JSON.stringify({...family,level:'error'}),ns,{}),null)
})

test('normalizes collector push URLs and existing query URLs without duplicating API paths',()=>{
 for(const path of ['', '/', '/loki/api/v1/push','/loki/api/v1/query_range']){
  const s=setup(()=>payload([]));s.env.AUDIT_LOKI_URL='http://observability_loki:3100'+path
  assert.equal(s.allowedLokiUrl().toString(),'http://observability_loki:3100/loki/api/v1/query_range')
 }
})
test('field drilldown discovers retained bounds, crosses empty periods beyond 90 days and scopes the source by student identities',async()=>{
 const oldAt=new Date('2024-02-01T12:00:00Z').getTime(),calls=[]
 const ctx=createContext({createHash,URL,URLSearchParams,AbortSignal,Buffer,Date,Intl,process:{env:{}},console:{info(){},warn(){}},controlEscolarCentralQuery:async(sql)=>sql.includes('FROM matricula')?[{matricula:'PT123'},{matricula:'PM0637'}]:[],fetch:async url=>{
  const start=Number(BigInt(url.searchParams.get('start'))/1000000n),end=Number(BigInt(url.searchParams.get('end'))/1000000n),index=url.pathname.endsWith('/index/stats')
  calls.push({index,start,end,query:url.searchParams.get('query')})
  const found=start<=oldAt&&end>=oldAt
  const data=index?{entries:found?2:0,chunks:found?1:0}: {status:'success',data:{result:found?[{stream:{container_name:'app-aurora'},values:[[String(BigInt(oldAt)*1000000n),JSON.stringify(school)],[String(BigInt(oldAt+1)*1000000n),JSON.stringify({...school,matricula:'PM0637'})]]}]:[]}}
  return {ok:true,json:async()=>data}
 }})
 runInContext(js,ctx)
 const result=await ctx.api.loadHistoricalActions({from:new Date(0),to:new Date('2026-10-16T12:00:00Z'),planteles:['PT'],matricula:'PT123',fullHistory:true})
 assert.ok(result.events.length>0);assert.ok(result.events.every(e=>e.matricula==='PT123'));assert.equal(result.events[0].date,'2024-02-01')
 assert.ok(calls.some(c=>c.index&&c.start===0));assert.ok(calls.filter(c=>!c.index).every(c=>c.query.includes('PT123')&&c.query.includes(hash('PT123'))));assert.ok(calls.filter(c=>!c.index).every(c=>c.end-c.start<=7*86400000));assert.equal(result.partial,false)
})

test('retry does not reuse a cached partial historical result',async()=>{
 let fail=true
 const s=setup(selector=>{if(fail&&selector.includes('container='))throw Error('temporary source failure');return payload([school],{container_name:'app-aurora'})})
 const input={from:new Date('2026-09-29T00:00:00Z'),to:new Date('2026-10-01T00:00:00Z'),planteles:['PT']}
 const first=await s.loadHistoricalActions(input);assert.equal(first.partial,true)
 const calls=s.calls.length;fail=false
 const second=await s.loadHistoricalActions(input);assert.ok(s.calls.length>calls);assert.equal(second.partial,false)
})
test('recovers explicit before/after from successful raw logs, but never guesses values from field names or hashes',()=>{
 const s=setup(()=>payload([]))
 const explicit=s.parseMessage(JSON.stringify({...school,changes:[{field:'grupo',before:'AMÉRICA',after:'ANTÁRTIDA'}]}),ns,{})
 assert.equal(explicit.changes[0].before,'AMÉRICA');assert.equal(explicit.changes[0].after,'ANTÁRTIDA')
 const legacy=s.parseMessage(JSON.stringify(school),ns,{})
 assert.equal(legacy.changes.length,0)
 const hashed=s.parseMessage(JSON.stringify({...school,changes:[{field:'grupo',before:{hash:'secret'},after:'ANTÁRTIDA'}]}),ns,{})
 assert.equal(hashed.changes.length,0)
})
test('explicit group log differences survive resolution into the historical API events',async()=>{
 const s=setup(()=>payload([{...school,changes:[{field:'grupo',before:'AMÉRICA',after:'ANTÁRTIDA'}]}],{container_name:'app-aurora'}))
 const result=await s.loadHistoricalActions({from:new Date('2026-09-29T00:00:00Z'),to:new Date('2026-10-01T00:00:00Z'),planteles:['PT']})
 assert.ok(result.events.length);assert.equal(result.events[0].quality,'verified');assert.equal(result.events[0].before,'AMÉRICA');assert.equal(result.events[0].after,'ANTÁRTIDA')
})

test('a collector-wrapped single-line audit JSON retains exact group differences and write identity',()=>{
 const s=setup(()=>payload([]))
 const data={...school,auditEventId:42,changes:[{field:'grupo',before:'AMÉRICA',after:'ANTÁRTIDA'}]}
 const parsed=s.parseMessage(JSON.stringify({log:JSON.stringify(data),stream:'stdout'}),ns,{})
 assert.equal(parsed.auditEventId,42);assert.equal(parsed.changes[0].before,'AMÉRICA');assert.equal(parsed.changes[0].after,'ANTÁRTIDA')
})

test('automatically retains explicit Husky Pass changes for every recorded field',async()=>{
 const event={...family,matricula:'PT123',changes:[{field:'grupo',before:'A',after:'B'},{field:'grado',before:'1',after:'2'}]}
 const s=setup(()=>payload([event]))
 const result=await s.loadHistoricalActions({from,to,planteles:['PT']})
 assert.deepEqual(Array.from(result.events,e=>e.field).sort(),['grado','grupo'])
 assert.ok(result.events.every(e=>e.quality==='verified'&&e.source==='Husky Pass'))
})
test('console decoder preserves literal values and refuses interleaved student identities or executable text',()=>{
 const s=setup(()=>payload([]))
 const lines=["[Control Escolar] matricula audited write {","matricula: 'PT123',","changes: [ { field: 'grupo', before: 'A,}', after: 'B' } ],","}"]
 const event=s.parseConsoleBlock(lines,ns,{container:'immutable'})
 assert.equal(event.matricula,'PT123');assert.equal(event.changes[0].before,'A,}')
 assert.equal(s.parseConsoleBlock([...lines.slice(0,-1),"matricula: 'PM0637',","}"],ns,{}),null)
 assert.equal(s.parseConsoleBlock([lines[0],"matricula: process.exit(),","}"],ns,{}),null)
})
test('student query automatically fetches stable-stream context and reconstructs unambiguous split changes',async()=>{
 const lines=["[Control Escolar] matricula audited write {","matricula: 'PT123',","actor: 'erika@casitaiedis.edu.mx',","changes: [ { field: 'grupo', before: 'A', after: 'B' } ],","}"]
 const calls=[]
 let tied=false
 const ctx=createContext({createHash,URL,URLSearchParams,AbortSignal,Buffer,Date,Intl,process:{env:{}},console:{info(){},warn(){}},controlEscolarCentralQuery:async()=>[],fetch:async url=>{
  const q=url.searchParams.get('query');calls.push(q)
  const values=q.includes('(?i)')?[[String(BigInt(ns)+1n),lines[1]]]:lines.map((line,i)=>[String(BigInt(ns)+BigInt(tied?0:i)),line])
  return {ok:true,json:async()=>({status:'success',data:{result:[{stream:{container:'immutable',container_name:'app-aurora',detected_level:'unknown',node:'casita01'},values}]}})}
 }})
 runInContext(js,ctx)
 const r=await ctx.api.queryLoki(from,to,['PT123'])
 assert.equal(r.records.length,1);assert.equal(r.records[0].changes[0].after,'B')
 const context=calls.find(q=>q.startsWith('{container="immutable"'))
 assert.ok(context);assert.equal(context.includes('detected_level'),false)
 tied=true
 const ambiguous=await ctx.api.queryLoki(from,to,['PT123'])
 assert.equal(ambiguous.records.length,0);assert.equal(ambiguous.partial,true)
})
