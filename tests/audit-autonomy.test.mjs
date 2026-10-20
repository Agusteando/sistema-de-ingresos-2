import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {startAuditRecovery,sourceConfiguration} from '../scripts/audit-recovery-worker.mjs'
import {runReader,withSourceOptions} from '../scripts/audit/native-source.mjs'

test('Aurora owns the worker, reader, persistent volume and lifecycle without a controller socket',async()=>{
 const root=new URL('../',import.meta.url)
 const manifest=JSON.parse(await readFile(new URL('migration.config.json',root),'utf8'))
 assert.ok(manifest.podman.volumes.some(v=>v.source==='aurora-audit-recovery'&&v.target==='/app/audit-data'&&!v.readOnly))
 const files=['scripts/audit-recovery-worker.mjs','scripts/audit/native-source.mjs','server/plugins/08.audit-recovery.ts']
 for(const file of files)assert.doesNotMatch(await readFile(new URL(file,root),'utf8'),/podman|migration-monitor|migration-control-plane|\/run\/.*sock|newPool|getState\(/)
 assert.doesNotMatch(await readFile(new URL('Containerfile',root),'utf8'),/COPY.*audit-recovery-service/);
 assert.match(await readFile(new URL('server/plugins/08.audit-recovery.ts',root),'utf8'),/hooks.hook\('close'/)
 const config=sourceConfiguration({CONTROL_ESCOLAR_MYSQL_HOST:'db',CONTROL_ESCOLAR_MYSQL_USER:'app',CONTROL_ESCOLAR_MYSQL_PASSWORD:'app-secret',CONTROL_ESCOLAR_MYSQL_DATABASE:'central',AUDIT_SOURCE_MYSQL_USER:'reader',AUDIT_SOURCE_MYSQL_PASSWORD:'reader-secret'})
 assert.equal(config.host,'db');assert.equal(config.user,'reader');assert.equal(config.password,'reader-secret');assert.equal(config.database,'central')
})

test('missing source read permission is traceable and never changes student rows or blocks normal app startup',async()=>{
 const writes=[],db={query:async sql=>{
  sql=typeof sql==='object'?sql.sql:sql
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]]
  if(sql.includes('DATABASE() AS schemaName'))return [[{schemaName:'central',serverUuid:'00000000-0000-0000-0000-000000000001',version:'8.4.11'}]]
  if(sql.includes('information_schema.COLUMNS'))return [[{name:'id',ordinal:1,type:'int'},{name:'matricula',ordinal:2,type:'varchar(255)'},{name:'grupo',ordinal:3,type:'varchar(255)'}]]
  if(sql.includes('MIN(created_at)'))return [[{oldestAudit:null}]]
  if(sql.includes('COUNT(*)'))return [[{count:0}]]
  return [[]]
 },execute:async(sql,params)=>{writes.push({sql,params});return [{insertId:1}]},end:async()=>{},destroy(){}}
 let connections=0
 const mysql={createConnection:async()=>{if(++connections===1)return db;throw Object.assign(Error('denied'),{code:'ER_SPECIFIC_ACCESS_DENIED_ERROR'})}}
 const worker=startAuditRecovery({environment:{CONTROL_ESCOLAR_MYSQL_USER:'app'},mysql,initialDelay:600000})
 try{await worker.run();assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0].params[0]).code,'AUDIT_SOURCE_READ_PERMISSION_REQUIRED');assert.match(writes[0].sql,/'audit_recovery_status'/)}finally{await worker.stop()}
})

test('source credentials are privately escaped, removed after failure and never put in reader arguments',async()=>{
 const root=await mkdtemp(join(tmpdir(),'audit-credentials-'))
 let optionPath
 try{
  await assert.rejects(withSourceOptions(root,{host:'db',user:'reader',password:'a"b\\c\nd'},async path=>{optionPath=path;const content=await readFile(path,'utf8');assert.match(content,/password="a\\"b\\\\c\\nd"/);throw Error('source unavailable')}),/unavailable/)
  await assert.rejects(readFile(optionPath),{code:'ENOENT'})
 }finally{await rm(root,{recursive:true,force:true})}
})

test('official packaged reader validates source CRC and cancels cleanly',{skip:!process.env.AUDIT_READER_TEST_BIN},async()=>{
 const {makeAuditBinlog}=await import('./fixtures/audit-binlog-synthetic.mjs')
 const root=await mkdtemp(join(tmpdir(),'audit-native-')),file=join(root,'mysql-bin.000001')
 try{
  await writeFile(file,makeAuditBinlog())
  await runReader(process.env.AUDIT_READER_TEST_BIN,['--no-defaults','--verify-binlog-checksum',file])
  const corrupt=makeAuditBinlog();corrupt[230]^=1;await writeFile(file,corrupt)
  await assert.rejects(runReader(process.env.AUDIT_READER_TEST_BIN,['--no-defaults','--verify-binlog-checksum',file]),/AUDIT_SOURCE_READ_FAILED/)
  const abort=new AbortController();abort.abort();await assert.rejects(runReader(process.env.AUDIT_READER_TEST_BIN,[],{signal:abort.signal}),/PAUSED/)
 }finally{await rm(root,{recursive:true,force:true})}
})


test('operational diagnosis distinguishes missing access, queued projection and incomplete coverage without writes or student data',async()=>{
 const {diagnoseRecovery}=await import('../scripts/audit/diagnostics.mjs')
 const queries=[]
 const db={query:async sql=>{queries.push(sql);return sql.includes("event_type='audit_recovery_status'")?[[{payload:{state:'running',pendingRecords:2,completeFiles:1,files:4}}]]:[[{state:'projected',code:null,count:2}]]}}
 const result=await diagnoseRecovery(db,async()=>{throw Object.assign(Error('denied'),{code:'ER_SPECIFIC_ACCESS_DENIED_ERROR'})})
 assert.equal(result.source.ready,false);assert.equal(result.source.code,'ER_SPECIFIC_ACCESS_DENIED_ERROR')
 assert.equal(result.recovery.pendingRecords,2);assert.equal(result.inbox[0].state,'projected')
 assert.ok(queries.every(sql=>sql.startsWith('SELECT')));assert.doesNotMatch(JSON.stringify(result),/password|matricula|sourceRecord/)
})
