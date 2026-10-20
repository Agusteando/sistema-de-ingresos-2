import test from 'node:test'
import assert from 'node:assert/strict'
import {recoverAuditSweep} from '../scripts/audit/audit-recovery-engine.mjs'

const descriptor={protocolVersion:1,serverUuid:'source',schemaFingerprint:'shape',schema:'casitaiedis',fields:[{name:'grupo',ordinal:12}]}
const files=[3,2,1].map(n=>({name:'mysql-bin.00000'+n,size:'100',headerSha256:'a'.repeat(64)}))
const inventory={serverUuid:'source',version:'8.4.11',format:'ROW',rowImage:'FULL',checksum:'CRC32',logBin:1,encrypted:false,files}
async function sweep(schemaVerified){
 const scanned=[]
 const result=await recoverAuditSweep({
  descriptor,inventory,state:{version:1,files:{}},budget:4,save:async()=>{},
  apply:async()=>({applied:true,results:[]}),
  scan:async file=>{
   scanned.push(file.name)
   if(file===files[0])throw Object.assign(Error('AUDIT_SOURCE_READ_FAILED'),{code:'AUDIT_SOURCE_READ_FAILED',sourcePhase:'decode',schemaVerified})
   return {summary:{count:0},batches:async function*(){},cleanup:async()=>{}}
  }
 })
 return {result,scanned}
}
test('decode failure with independently verified schema does not block older files',async()=>{
 const {result,scanned}=await sweep(true)
 assert.equal(result.completeFiles,2)
 assert.deepEqual(scanned,files.map(f=>f.name))
 assert.equal(result.errors[files[0].name],'AUDIT_SOURCE_READ_FAILED')
 assert.equal(result.errorDetails[files[0].name].schemaVerified,true)
 assert.equal(result.state,'error')
})
test('unverified source failure still blocks older files',async()=>{
 const {result,scanned}=await sweep(false)
 assert.equal(result.completeFiles,0)
 assert.deepEqual(scanned,[files[0].name])
 assert.equal(result.errors[files[1].name],'AUDIT_SCHEMA_CONTEXT_UNVERIFIED')
})
