import test from 'node:test'
import assert from 'node:assert/strict'
import {decodeAuditBinlog,utf8Lines} from '../scripts/audit/audit-binlog-decoder.mjs'
import {recoverAuditSweep,recoveryFileKey,canonicalBinlogPreamble} from '../scripts/audit/audit-recovery-engine.mjs'
import {Readable} from 'node:stream'
const descriptor={protocolVersion:1,schema:'central',serverUuid:'00000000-0000-0000-0000-000000000001',version:'8.4.11',schemaFingerprint:'map1',identityOrdinal:2,columnCount:3,fields:[{name:'grupo',ordinal:3}],oldestAudit:'2026-10-01 00:00:00'}
const file={name:'mysql-bin.000335',size:'1000',headerSha256:'a'.repeat(64)}
const header='#261014 19:59:53 server id 1 end_log_pos 200 CRC32 0x18a63e07 Update_rows: table id 2 flags: STMT_END_F'
const row=(matricula='PM1626',before="'ANTÁRTIDA'",after="'AMÉRICA'")=>['# at 100',header,'### UPDATE `central`.`matricula`','### WHERE','###   @1=42 /* INT meta=0 nullable=0 is_null=0 */',`###   @2='${matricula}' /* VARSTRING(255) */`,`###   @3=${before} /* VARSTRING(255) */`,'### SET','###   @1=42 /* INT meta=0 nullable=0 is_null=0 */',`###   @2='${matricula}' /* VARSTRING(255) */`,`###   @3=${after} /* VARSTRING(255) */`]
const commit=['# at 200','#261014 19:59:53 server id 1 end_log_pos 231 CRC32 0x96a70a58 Xid = 50484068','COMMIT/*!*/;']
async function decode(lines,override={}){const records=[];const summary=await decodeAuditBinlog(lines,{descriptor,file:file.name,onCommit:async rows=>records.push(...rows),...override});return {summary,records}}
test('all student writes and exact committed field images are extracted without a selected student',async()=>{
 const {records,summary}=await decode([...row(),...row('PT0123',"''","'NORTE'"),...commit])
 assert.equal(records.length,2);assert.equal(records[0].beforeSql,"'ANTÁRTIDA'");assert.equal(records[0].recordedAt,'2026-10-14 13:59:53');assert.equal(records[0].evidence.xid,'50484068');assert.equal(records[0].evidence.commitPosition,'231');assert.equal(records[1].matricula,'PT0123');assert.equal(summary.count,2);assert.match(records[0].evidence.decodedRowSha256,/^[a-f0-9]{64}$/)
})
test('rollback and unchanged source rows never become edits; source NULL and empty remain distinct',async()=>{
 assert.equal((await decode([...row(), 'ROLLBACK;'])).records.length,0)
 assert.equal((await decode([...row('PM1626',"'A'","'A'"),...commit])).records.length,0)
 assert.equal((await decode([...row('PM1626','NULL',"''"),...commit])).records[0].beforeSql,'NULL')
 await assert.rejects(decode([...row(),'ROLLBACK /* added by mysqlbinlog */;']),/UNCOMMITTED_TAIL/)
})
test('schema drift, incomplete images and SQL comment-like literal content cannot silently invent values',async()=>{
 await assert.rejects(decode([...row().filter(line=>!line.startsWith('###   @3=')),...commit]),/ROW_IMAGE_INCOMPLETE/)
 const result=await decode([...row('PM1626',"'A /* VARSTRING content */'","'B'"),...commit])
 assert.equal(result.records[0].beforeSql,"'A /* VARSTRING content */'")
 assert.equal((await decode(['ALTER TABLE `central`.`matricula` ADD COLUMN foo INT/*!*/;',...row(),...commit])).summary.ddl,true)
})
test('invalid UTF-8 fails rather than replacing historical text',async()=>{
 await assert.rejects(async()=>{for await(const line of utf8Lines(Readable.from([Buffer.from([0xff,10])]))){void line}},/encoded data/)
})
const inventory={serverUuid:descriptor.serverUuid,version:'8.4.11',format:'ROW',rowImage:'FULL',checksum:'CRC32',logBin:1,encrypted:false,files:[file]}
const scan=async()=>({summary:{count:1,firstEventAt:'2026-10-12 00:00:00',lastCommitAt:'2026-10-14 13:59:53',lastCommitPosition:'231',ddl:false},async*batches(){yield [{id:'source'}]},async cleanup(){}})
const apply=async bundle=>({applied:true,results:bundle.records.map(()=>({status:'imported'}))})
test('checkpoints advance only after confirmed imports and survive normal repeated sweeps',async()=>{
 const saved=[];const one=await recoverAuditSweep({descriptor,inventory,state:{},scan,apply,save:async s=>saved.push(structuredClone(s))})
 assert.equal(one.completeFiles,1);assert.equal(one.state,'retention-gap');assert.equal(one.retentionGap,true);assert.ok(saved.length)
 let scans=0;const two=await recoverAuditSweep({descriptor,inventory,state:one,scan:async()=>{scans++;return scan()},apply,save:async()=>{}})
 assert.equal(scans,0);assert.equal(two.completeFiles,1)
})
test('failure after database commit but before checkpoint retries safely through idempotent imports',async()=>{
 let commits=0,saves=0
 const importer=async bundle=>{commits++;return {applied:true,results:bundle.records.map(()=>({status:commits===1?'imported':'already-imported'}))}}
 await assert.rejects(recoverAuditSweep({descriptor,inventory,state:{},scan,apply:importer,save:async()=>{saves++;throw Error('disk full')}}),/disk full/)
 const retry=await recoverAuditSweep({descriptor,inventory,state:{},scan,apply:importer,save:async()=>{}})
 assert.equal(commits,2);assert.equal(retry.completeFiles,1)
})
test('a source server mismatch, missing CRC/full images and unconfirmed imports fail closed',async()=>{
 for(const overrides of [{serverUuid:'other'},{rowImage:'MINIMAL'},{checksum:'NONE'},{encrypted:true}])await assert.rejects(recoverAuditSweep({descriptor,inventory:{...inventory,...overrides},state:{},scan,apply,save:async()=>{}}))
 const bad=await recoverAuditSweep({descriptor,inventory,state:{},scan,apply:async()=>({applied:false,results:[]}),save:async()=>{}})
 assert.equal(bad.state,'error');assert.equal(bad.completeFiles,0);assert.equal(bad.files[recoveryFileKey(file,descriptor)],undefined)
})
test('schema boundaries stop imports for that file and every older file',async()=>{
 const files=[{...file,name:'mysql-bin.000334'},file],imports=[]
 const result=await recoverAuditSweep({descriptor,inventory:{...inventory,files},state:{},scan:async f=>({...await scan(),summary:{...(await scan()).summary,ddl:f.name==='mysql-bin.000335'}}),apply:async bundle=>{imports.push(bundle);return apply(bundle)},save:async()=>{}})
 assert.equal(imports.length,0);assert.equal(result.state,'error');assert.equal(result.schemaBoundary,'mysql-bin.000335')
})
test('growth is rescanned while source preamble identity distinguishes reused log names',async()=>{
 const old={sourceUuid:descriptor.serverUuid,files:{[recoveryFileKey(file,descriptor)]:{complete:true,size:file.size}}}
 let scanned=0
 await recoverAuditSweep({descriptor,inventory:{...inventory,files:[{...file,size:'1001'}]},state:old,scan:async()=>{scanned++;return scan()},apply,save:async()=>{}})
 assert.equal(scanned,1)
 assert.notEqual(recoveryFileKey(file,descriptor),recoveryFileKey({...file,headerSha256:'b'.repeat(64)},descriptor))
})
test('normal log close lifecycle bits cannot create a false source epoch',()=>{
 const bytes=Buffer.alloc(256);bytes[0]=254;bytes.write('bin',1);bytes[8]=15;bytes.writeUInt32LE(120,13);bytes[21]=1
 const a=canonicalBinlogPreamble(bytes);bytes[21]=0;bytes.fill(7,120,124)
 assert.equal(canonicalBinlogPreamble(bytes),a)
 bytes[150]=1;assert.notEqual(canonicalBinlogPreamble(bytes),a)
})

test('raw source guard detects qualified DDL hidden by a different default database',async()=>{
 const {createAuditSchemaGuard}=await import('../scripts/audit/audit-binlog-guard.mjs')
 const {makeAuditBinlog}=await import('./fixtures/audit-binlog-synthetic.mjs')
 for(const ddl of [{database:'other',sql:'ALTER TABLE `central`.`matricula` ADD COLUMN test INT'},{database:'central',sql:'/*!80000 ALTER TABLE matricula ADD COLUMN test INT */'}]){
  const guard=createAuditSchemaGuard('central'),binary=makeAuditBinlog({ddl})
  for(let offset=0;offset<binary.length;offset+=7)guard.write(binary.subarray(offset,offset+7))
  assert.equal(guard.finish().ddl,true)
 }
 const clean=createAuditSchemaGuard('central');clean.write(makeAuditBinlog({ddl:{database:'other',sql:'ALTER TABLE other.matricula ADD COLUMN test INT'}}));assert.equal(clean.finish().ddl,false)
 const truncated=createAuditSchemaGuard('central');truncated.write(makeAuditBinlog().subarray(0,100));assert.throws(()=>truncated.finish(),/TRUNCATED/)
})



test('native space-padded UTC hours retain exact timestamp and row/commit anchors',async()=>{
 const lines=[...row(),...commit].map(line=>line.replace('19:59:53',' 2:05:57'))
 const {records}=await decode(lines)
 assert.equal(records.length,1);assert.equal(records[0].recordedAt,'2026-10-13 20:05:57')
})


test('an unreadable source file cannot suppress committed evidence from another file',async()=>{
 const unavailable={name:'mysql-bin.000334',size:'1000',sourceError:'AUDIT_SOURCE_READ_FAILED'}
 let applied=0
 const result=await recoverAuditSweep({descriptor,inventory:{...inventory,files:[unavailable,file]},state:{},scan,apply:async bundle=>{applied+=bundle.records.length;return apply(bundle)},save:async()=>{}})
 assert.equal(applied,1);assert.equal(result.completeFiles,1);assert.equal(result.errors[unavailable.name],'AUDIT_SOURCE_READ_FAILED')
})

test('expired failed files leave a retention gap but do not permanently poison the retained inventory',async()=>{
 const result=await recoverAuditSweep({descriptor,inventory,state:{sourceUuid:descriptor.serverUuid,errors:{'mysql-bin.000333':'AUDIT_SOURCE_READ_FAILED'}},scan,apply,save:async()=>{}})
 assert.equal(Object.keys(result.errors).length,0);assert.equal(result.retentionGap,true);assert.deepEqual(result.expiredFiles,['mysql-bin.000333'])
})
