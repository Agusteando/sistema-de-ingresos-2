import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {describeRecoverySource,recordRecoveryStatus,runRecoveryService} from '../scripts/audit-recovery-service.mjs'
import {auditSourceFields,recoverableAuditColumns} from '../shared/utils/auditSourceFields.mjs'
import {validateBinlogRecovery,recoverySourceKey} from '../shared/utils/auditRecovery.mjs'
test('automatic source policy has exact production write-contract parity',()=>{
 const source=readFileSync(new URL('../server/utils/control-escolar.ts',import.meta.url),'utf8').split('const PATCH_FIELD_COLUMN_MAP: Record<string, string> = {')[1].split('\n};')[0]
 const real=Object.fromEntries([...source.matchAll(/\s*(\w+): "(\w+)"/g)].map(m=>[m[1],m[2]]))
 assert.deepEqual(auditSourceFields,real)
 for(const column of recoverableAuditColumns)assert.equal(/foto|photo|adjunt|ine|curp|password|token|secret/i.test(column),false)
})
test('descriptor identifies actual database/server/schema, source ordinals and public fields only',async()=>{
 const calls=[]
 const db={query:async sql=>{calls.push(sql);return sql.includes('server_uuid')?[[{schemaName:'central',serverUuid:'00000000-0000-0000-0000-000000000001',version:'8.4.11'}]]:sql.includes('information_schema')?[[{name:'id',ordinal:1,type:'int'},{name:'matricula',ordinal:2,type:'varchar(255)'},{name:'grupo',ordinal:3,type:'varchar(255)'},{name:'password',ordinal:4,type:'varchar(255)'}]]:[[{oldestAudit:'2026-01-01 00:00:00'}]]}}
 const result=await describeRecoverySource(db)
 assert.equal(result.schema,'central');assert.equal(result.identityOrdinal,2);assert.equal(result.columnCount,4);assert.deepEqual(result.fields.map(f=>f.name),['grupo']);assert.match(result.schemaFingerprint,/^[a-f0-9]{64}$/)
 assert.ok(calls.every(sql=>sql.startsWith('SELECT')))
})
test('status updates only its own system row and never modifies historical events or student data',async()=>{
 const writes=[];const db={query:async()=>[[{id:77}]],execute:async(...args)=>{writes.push(args)}}
 await recordRecoveryStatus(db,{version:1,state:'running',files:3})
 assert.equal(writes.length,1);assert.match(writes[0][0],/event_type='audit_recovery_status'/);assert.match(writes[0][0],/source_flow='audit_recovery_service'/);assert.equal(writes[0][1][1],77)
 await assert.rejects(recordRecoveryStatus(db,{version:1,state:'green'}),/INVALID_RECOVERY_STATUS/)
 await assert.rejects(runRecoveryService(db,[],{}),/RECOVERY_MODE_REQUIRED/)
})
test('automatic source identity separates reused filenames between servers and log epochs',()=>{
 const raw=JSON.parse(readFileSync(new URL('./fixtures/audit-recovery-pm1626.json',import.meta.url))).records[0]
 const source=uuid=>validateBinlogRecovery({...raw,evidence:{...raw.evidence,sourceServerUuid:uuid,sourceFileHeaderSha256:'a'.repeat(64)}})
 const a=source('00000000-0000-0000-0000-000000000001'),b=source('00000000-0000-0000-0000-000000000002')
 assert.notEqual(recoverySourceKey(a),recoverySourceKey(b))
 assert.throws(()=>validateBinlogRecovery({...raw,evidence:{...raw.evidence,sourceServerUuid:'invalid'}}),/Invalid source server/)
})
