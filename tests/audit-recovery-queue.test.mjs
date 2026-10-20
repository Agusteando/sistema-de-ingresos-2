import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {captureRecovery,retryRecoveryQueue} from '../shared/utils/auditRecoveryQueue.mjs'
const real=JSON.parse(readFileSync(new URL('./fixtures/audit-recovery-pm1626.json',import.meta.url))).records[0]
const source={...real,evidence:{...real.evidence,sourceServerUuid:'00000000-0000-0000-0000-000000000001',sourceFileHeaderSha256:'a'.repeat(64)}}
function setup(){
 const rows=new Map(),writes=[];let checkpoint
 const db={rows,writes,async query(sql){
  if(sql.includes('DATABASE()'))return [[{name:source.evidence.schema,serverUuid:source.evidence.sourceServerUuid}]]
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]]
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]]
  return [[...rows.values()].filter(row=>row.payload.state!=='applied')]
 },async beginTransaction(){checkpoint=structuredClone([...rows])},async commit(){checkpoint=null},async rollback(){if(checkpoint){rows.clear();for(const [key,row]of checkpoint)rows.set(key,row)}},async execute(sql,params){
  if(sql.includes('SELECT id,payload'))return [rows.has(params[0])?[rows.get(params[0])]:[]]
  if(sql.includes('INSERT INTO')){const payload=JSON.parse(params[2]);rows.set(payload.fingerprint,{id:rows.size+1,payload});writes.push(sql);return [{insertId:rows.size}]}
  if(sql.includes('SELECT COUNT'))return [[{count:[...rows.values()].filter(row=>row.payload.sourceRecord.matricula===params[0]&&row.payload.sourceRecord.field===params[1]&&row.payload.sourceRecord.recordedAt===params[2]).length}]]
  writes.push(sql)
  if(sql.includes("'$.state',?")){rows.get(params[1]).payload.state=params[0]}
  else{const row=rows.get(params[2]);row.payload.lastError=params[0]}
  return [{affectedRows:1}]
 }}
 return db
}
test('all committed source evidence is durable before attribution/import and repeated capture is idempotent',async()=>{
 const db=setup(),bundle={version:1,records:[structuredClone(source)]}
 const a=await captureRecovery(db,bundle);assert.equal(a.results[0].status,'captured');assert.equal(db.rows.size,1)
 await captureRecovery(db,bundle);assert.equal(db.rows.size,1)
 assert.ok(db.writes.every(sql=>sql.includes('audit_recovery_pending')))
 assert.equal([...db.rows.values()][0].payload.sourceRecord.beforeSql,"'ANTÁRTIDA'")
})
test('failed imports survive log expiration in the inbox, retry automatically and do not block other students',async()=>{
 const db=setup(),second={...source,matricula:'PT0123',rowId:'8079029'}
 await captureRecovery(db,{version:1,records:[source,second]})
 let unavailable=true
 const importer=async(_,bundle)=>{if(unavailable&&bundle.records[0].matricula==='PM1626')throw Object.assign(Error('temporary lookup'),{code:'RECOVERY_STUDENT_MISMATCH'});return {applied:true,results:[{status:'imported'}]}}
 const first=await retryRecoveryQueue(db,importer)
 assert.deepEqual(first.results.map(r=>r.status),['queued','imported']);assert.equal([...db.rows.values()][0].payload.lastError,'RECOVERY_STUDENT_MISMATCH')
 unavailable=false
 const next=await retryRecoveryQueue(db,importer);assert.equal(next.results.length,1);assert.equal(next.results[0].status,'imported')
 assert.ok([...db.rows.values()].every(row=>row.payload.state==='applied'));assert.equal(db.rows.size,2)
})
test('multiple source writes within one second cannot inherit a single recorded account by proximity',async()=>{
 const db=setup(),another={...source,beforeSql:"'AMÉRICA'",afterSql:"'EUROPA'",evidence:{...source.evidence,position:'500849126',endPosition:'500850000',commitPosition:'500850040'}}
 await captureRecovery(db,{version:1,records:[source,another]})
 const flags=[];await retryRecoveryQueue(db,async(_,bundle,options)=>{flags.push(options.sourceAmbiguous);return {applied:true,results:[{status:'imported'}]}})
 assert.deepEqual(flags,[true,true])
})
test('source identity, approved field policy and conflicting source reuse are enforced before persistence',async()=>{
 const db=setup();await captureRecovery(db,{version:1,records:[source]})
 await assert.rejects(captureRecovery(db,{version:1,records:[{...source,afterSql:"'EUROPA'"}]}),/SOURCE_CONFLICT/)
 await assert.rejects(captureRecovery(db,{version:1,records:[{...source,field:'password'}]}),/SOURCE_INVALID/)
 await assert.rejects(captureRecovery(db,{version:1,records:[{...source,evidence:{...source.evidence,sourceServerUuid:'00000000-0000-0000-0000-000000000002'}}]}),/SERVER_MISMATCH/)
 assert.equal(db.rows.size,1)
})


test('published values remain retryable for account linking without needing the source again',async()=>{
 const db=setup();await captureRecovery(db,{version:1,records:[source]})
 const modes=[]
 const importer=async(_,bundle,options)=>{modes.push(options.deferAttribution);return {applied:true,results:[{status:'imported',attributionPending:options.deferAttribution}]}}
 await retryRecoveryQueue(db,importer,{deferAttribution:true})
 assert.equal([...db.rows.values()][0].payload.state,'projected')
 await retryRecoveryQueue(db,importer,{deferAttribution:false})
 assert.equal([...db.rows.values()][0].payload.state,'applied');assert.deepEqual(modes,[true,false])
})
