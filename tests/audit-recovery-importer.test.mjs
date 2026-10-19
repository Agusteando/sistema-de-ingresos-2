import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {importAuditRecovery} from '../scripts/import-audit-recovery.mjs'
const bundle=JSON.parse(readFileSync(new URL('./fixtures/audit-recovery-pm1626.json',import.meta.url),'utf8'))
const original={id:5629,event_type:'student_update',matricula:'PM1626',plantel:'PM',ciclo:'2026',actor_name:'Erika Ramos Escalera',actor_email:'control.escolar.pm@casitaiedis.edu.mx',recorded_at:'2026-10-14 13:59:53.000000',payload:{fields:['grupo']}}
function database({anchors=[original],rowId='8079028',schema='casitaiedis',lock=1}={}){
 const state={saved:[],sql:[],commits:0,rollbacks:0},db={
  query:async(sql)=>{
   state.sql.push(sql)
   if(sql==='SELECT DATABASE() AS name')return [[{name:schema}]]
   if(sql.includes('information_schema.COLUMNS'))return [[{COLUMN_NAME:'id',ORDINAL_POSITION:1},{COLUMN_NAME:'matricula',ORDINAL_POSITION:2},{COLUMN_NAME:'grupo',ORDINAL_POSITION:12}]]
   if(sql.includes('GET_LOCK'))return [[{acquired:lock}]]
   return [[]]
  },
  beginTransaction:async()=>{state.snapshot=state.saved.length},
  commit:async()=>{state.commits++},
  rollback:async()=>{state.rollbacks++;state.saved.splice(state.snapshot||0)},
  execute:async(sql,params)=>{
   state.sql.push(sql)
   if(sql.startsWith('SELECT id, payload'))return [state.saved.filter(row=>row.event_type==='student_update_recovery'&&row.matricula===params[0]&&JSON.parse(row.payload).originalEventId===params[1])]
   if(sql.startsWith('SELECT id,payload'))return [state.saved.filter(row=>JSON.parse(row.payload).fingerprint===params[0])]
   if(sql.startsWith('SELECT id FROM matricula'))return [[{id:rowId}]]
   if(sql.startsWith('SELECT id,event_type'))return [anchors]
   if(sql.startsWith('INSERT INTO control_escolar_audit_events')){
    const id=9000+state.saved.length
    state.saved.push({id,event_type:params[0],plantel:params[1],matricula:params[3],actor_name:params[5],payload:params[10],created_at:params[11]})
    return [{insertId:id}]
   }
   throw Error('Unexpected SQL: '+sql)
  }
 }
 return {db,state}
}
test('preview writes nothing; apply adds separate evidence once and retains the original record',async()=>{
 const {db,state}=database(),before=JSON.stringify(original)
 const preview=await importAuditRecovery(db,bundle)
 assert.equal(preview.applied,false);assert.equal(state.saved.length,0)
 assert.equal(preview.results[0].originalEventId,'5629')
 const applied=await importAuditRecovery(db,bundle,{apply:true})
 assert.equal(state.saved.length,1);assert.equal(state.saved[0].event_type,'student_update_recovery')
 assert.equal(applied.results[0].before,'ANTÁRTIDA');assert.equal(applied.results[0].after,'AMÉRICA')
 const repeated=await importAuditRecovery(db,bundle,{apply:true})
 assert.equal(repeated.results[0].status,'already-imported');assert.equal(state.saved.length,1)
 assert.equal(JSON.stringify(original),before)
 assert.ok(!state.sql.some(sql=>/^(UPDATE|DELETE|ALTER|CREATE|DROP)/.test(sql)))
})
test('unmatched or ambiguous anchors preserve the values as an unattributed write, never as Erika',async()=>{
 for(const anchors of [[],[original,{...original,id:5630}]]){
  const {db,state}=database({anchors}),result=await importAuditRecovery(db,bundle,{apply:true})
  assert.equal(result.results[0].attribution,'unresolved');assert.equal(result.results[0].originalEventId,null)
  assert.equal(state.saved[0].event_type,'student_update');assert.equal(state.saved[0].actor_name,'Sin identificar')
 }
})
test('wrong database, wrong student primary key, lock failure or conflicting ledger cannot write evidence',async()=>{
 for(const args of [{schema:'another_db'},{rowId:'999'},{lock:0},{anchors:[{...original,payload:{changes:[{field:'grupo',before:'ÁFRICA',after:'AMÉRICA'}]}}]}]){
  const {db,state}=database(args)
  await assert.rejects(importAuditRecovery(db,bundle,{apply:true}));assert.equal(state.saved.length,0)
 }
})
test('a later error rolls back the entire evidence bundle',async()=>{
 const {db,state}=database()
 const bad={...bundle.records[0],rowId:'999',evidence:{...bundle.records[0].evidence,position:'500848403'}}
 await assert.rejects(importAuditRecovery(db,{version:1,records:[bundle.records[0],bad]},{apply:true}))
 assert.equal(state.saved.length,0);assert.equal(state.commits,0);assert.ok(state.rollbacks>0)
})

test('a mislabeled source column cannot be imported as another field',async()=>{
 const {db,state}=database()
 const source={...bundle.records[0],evidence:{...bundle.records[0].evidence,fieldOrdinal:13}}
 await assert.rejects(importAuditRecovery(db,{version:1,records:[source]},{apply:true}),error=>error.code==='RECOVERY_COLUMN_MAP_MISMATCH')
 assert.equal(state.saved.length,0)
})

test('a reused source cannot change its identity and a second source cannot corrupt an existing field overlay',async()=>{
 const {db,state}=database();await importAuditRecovery(db,bundle,{apply:true})
 await assert.rejects(importAuditRecovery(db,{version:1,records:[{...bundle.records[0],matricula:'PM9999'}]},{apply:true}),e=>e.code==='RECOVERY_SOURCE_CONFLICT')
 const next={...bundle.records[0],beforeSql:"'ÁFRICA'",evidence:{...bundle.records[0].evidence,position:'500848403'}}
 await assert.rejects(importAuditRecovery(db,{version:1,records:[next]},{apply:true}),e=>e.code==='RECOVERY_TARGET_ALREADY_LINKED')
 assert.equal(state.saved.length,1)
})
