import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readSourceInventory,startAuditRecovery} from '../scripts/audit-recovery-worker.mjs'
import {describeRecoverySource} from '../scripts/audit/service.mjs'
import {withSourceOptions,downloadRaw,scanSourceFile,replayVerifiedSpools} from '../scripts/audit/native-source.mjs'
import {captureRecovery,retryRecoveryQueue} from '../shared/utils/auditRecoveryQueue.mjs'
import {importAuditRecovery} from '../scripts/import-audit-recovery.mjs'
import {indexAuditRecoveries} from '../shared/utils/auditRecovery.mjs'

test('direct MySQL source: remote read, verified values, durable replay and original account projection without a control plane',{skip:!process.env.AUDIT_TEST_MYSQL_URL||!process.env.AUDIT_READER_TEST_BIN},async()=>{
 const mysql=await import('mysql2/promise'),db=await mysql.createConnection(process.env.AUDIT_TEST_MYSQL_URL)
 const url=new URL(process.env.AUDIT_TEST_MYSQL_URL),schema='audit_source_ci_'+process.pid,root=await mkdtemp(join(tmpdir(),'aurora-source-'))
 const reader='audit_reader_'+process.pid
 const connection={host:url.hostname,port:Number(url.port||3306),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password)}
 try{
  await db.query('CREATE DATABASE `'+schema+'` CHARACTER SET utf8mb4');await db.query('USE `'+schema+'`')
  await db.query('CREATE TABLE matricula(id INT PRIMARY KEY,matricula VARCHAR(255),grupo VARCHAR(255))')
  await db.query(`CREATE TABLE control_escolar_audit_events(id BIGINT AUTO_INCREMENT PRIMARY KEY,event_type VARCHAR(64),plantel VARCHAR(20),ciclo VARCHAR(20),matricula VARCHAR(255),actor_email VARCHAR(255),actor_name VARCHAR(255),actor_role VARCHAR(80),summary TEXT,source_base VARCHAR(80),source_flow VARCHAR(180),payload JSON,created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),INDEX(event_type,matricula,created_at))`)
  await db.execute("INSERT INTO matricula VALUES(42,'TX9876','ANTÁRTIDA')")
  if(process.env.AUDIT_TEST_ISOLATED_SOURCE==='1'){
   await db.query("CREATE USER '"+reader+"'@'%' IDENTIFIED BY 'isolated-test-secret'")
   await db.query("GRANT SELECT ON `"+schema+"`.* TO '"+reader+"'@'%'")
   const denied=await mysql.createConnection({...connection,user:reader,password:'isolated-test-secret',database:schema})
   try{await assert.rejects(readSourceInventory(denied),e=>e.code==='ER_SPECIFIC_ACCESS_DENIED_ERROR')}finally{await denied.end()}
   await db.query("GRANT REPLICATION CLIENT, REPLICATION SLAVE ON *.* TO '"+reader+"'@'%'")
   connection.user=reader;connection.password='isolated-test-secret'
  }
  await db.query('FLUSH BINARY LOGS')
  const [[active]]=await db.query('SHOW BINARY LOG STATUS')
  await db.query("UPDATE matricula SET grupo='AMÉRICA' WHERE id=42")
  await db.query('FLUSH BINARY LOGS')
  const descriptor=await describeRecoverySource(db),inventory=await readSourceInventory(db),file=inventory.files.find(f=>f.name===active.File)
  const tool=process.env.AUDIT_READER_TEST_BIN
  await withSourceOptions(root,connection,async optionsFile=>{
   const prefix=await downloadRaw({tool,optionsFile,file,root,preambleOnly:true})
   try{file.headerSha256=prefix.headerSha256}finally{await prefix.cleanup()}
   const result=await scanSourceFile(file,descriptor,new AbortController().signal,{tool,optionsFile,root,readDescriptor:()=>describeRecoverySource(db)})
   const records=[];for await(const batch of result.batches())records.push(...batch)
   assert.equal(result.summary.ddl,false);assert.equal(records.length,1)
   assert.equal(records[0].beforeSql,"'ANTÁRTIDA'");assert.equal(records[0].afterSql,"'AMÉRICA'")
   const source=records[0]
   const [insert]=await db.execute("INSERT INTO control_escolar_audit_events(event_type,plantel,ciclo,matricula,actor_email,actor_name,source_flow,payload,created_at) VALUES('student_update','TX','2026','TX9876','account@example.test','Recorded account','student_patch_matricula_overlay',?,?)",[JSON.stringify({fields:['grupo']}),source.recordedAt])
   // A failed app capture retains the verified spool, independent of source.
   await assert.rejects(replayVerifiedSpools(root,descriptor.serverUuid,async()=>{throw Error('database unavailable')}),/unavailable/)
   await replayVerifiedSpools(root,descriptor.serverUuid,bundle=>captureRecovery(db,bundle))
   assert.equal((await describeRecoverySource(db)).pendingRecords,1)
   if(process.env.AUDIT_TEST_ISOLATED_SOURCE==='1'){
    await db.query("REVOKE REPLICATION CLIENT, REPLICATION SLAVE ON *.* FROM '"+reader+"'@'%'")
    const offline=startAuditRecovery({mysql,tool,initialDelay:3600000,environment:{CONTROL_ESCOLAR_MYSQL_HOST:connection.host,CONTROL_ESCOLAR_MYSQL_PORT:String(connection.port),CONTROL_ESCOLAR_MYSQL_USER:decodeURIComponent(url.username),CONTROL_ESCOLAR_MYSQL_PASSWORD:decodeURIComponent(url.password),AUDIT_SOURCE_MYSQL_USER:connection.user,AUDIT_SOURCE_MYSQL_PASSWORD:connection.password,CONTROL_ESCOLAR_MYSQL_DATABASE:schema,AUDIT_RECOVERY_DATA_DIR:join(root,'source-unavailable')}})
    try{
     await offline.run()
     const [[status]]=await db.query("SELECT payload FROM control_escolar_audit_events WHERE event_type='audit_recovery_status' ORDER BY id DESC LIMIT 1")
     const proof=typeof status.payload==='string'?JSON.parse(status.payload):status.payload
     assert.equal(proof.code,'AUDIT_SOURCE_READ_PERMISSION_REQUIRED');assert.equal(proof.pendingRecords,1)
     const [[published]]=await db.query("SELECT COUNT(*) AS count FROM control_escolar_audit_events WHERE source_flow='mysql_binlog_recovered'")
     assert.equal(published.count,1)
    }finally{await offline.stop()}
    await db.query("GRANT REPLICATION CLIENT, REPLICATION SLAVE ON *.* TO '"+reader+"'@'%'")
   }
   const partial=await retryRecoveryQueue(db,importAuditRecovery,{deferAttribution:true})
   assert.equal(partial.results[0].attributionPending,true)
   assert.equal((await describeRecoverySource(db)).pendingRecords,1)
   const [visible]=await db.query("SELECT payload FROM control_escolar_audit_events WHERE source_flow='mysql_binlog_recovered'")
   assert.equal(visible.length,1)
   const provisional=typeof visible[0].payload==='string'?JSON.parse(visible[0].payload):visible[0].payload
   assert.equal(provisional.changes[0].before,'ANTÁRTIDA');assert.equal(provisional.changes[0].after,'AMÉRICA')
   const applied=await retryRecoveryQueue(db,importAuditRecovery)
   assert.equal(applied.results[0].status,'imported');assert.equal(applied.results[0].originalEventId,String(insert.insertId))
   assert.equal((await describeRecoverySource(db)).pendingRecords,0)
   const [originals]=await db.query("SELECT *,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS recorded_at FROM control_escolar_audit_events WHERE event_type='student_update'")
   const [recoveries]=await db.query("SELECT * FROM control_escolar_audit_events WHERE event_type='student_update_recovery'")
   const projected=indexAuditRecoveries(originals,recoveries).get(String(insert.insertId)+'|grupo')
   assert.equal(projected.before,'ANTÁRTIDA');assert.equal(projected.after,'AMÉRICA');assert.equal(originals[0].actor_name,'Recorded account')
   if(process.env.AUDIT_TEST_ISOLATED_SOURCE==='1'){
    // Only our disposable MySQL server may purge test history. This exercises
    // the real owner loop with a retained inventory that contains no old DDL.
    await db.query("PURGE BINARY LOGS TO '"+file.name+"'")
    await db.query("UPDATE matricula SET grupo='ÁFRICA' WHERE id=42")
    await db.query('FLUSH BINARY LOGS')
    const statuses=[]
    const tracedMysql={...mysql,createConnection:async config=>{
     const connection=await mysql.createConnection(config),execute=connection.execute.bind(connection)
     connection.execute=async(sql,args)=>{if(sql.includes('audit_recovery_status'))statuses.push(JSON.parse(args[0]));return execute(sql,args)}
     return connection
    }}
    const worker=startAuditRecovery({mysql:tracedMysql,tool,initialDelay:3600000,environment:{CONTROL_ESCOLAR_MYSQL_HOST:connection.host,CONTROL_ESCOLAR_MYSQL_PORT:String(connection.port),CONTROL_ESCOLAR_MYSQL_USER:decodeURIComponent(url.username),CONTROL_ESCOLAR_MYSQL_PASSWORD:decodeURIComponent(url.password),AUDIT_SOURCE_MYSQL_USER:connection.user,AUDIT_SOURCE_MYSQL_PASSWORD:connection.password,CONTROL_ESCOLAR_MYSQL_DATABASE:schema,AUDIT_RECOVERY_DATA_DIR:join(root,'owned')}})
    try{
     await worker.run()
     const [[status]]=await db.query("SELECT payload FROM control_escolar_audit_events WHERE event_type='audit_recovery_status' ORDER BY id DESC LIMIT 1")
     const state=typeof status.payload==='string'?JSON.parse(status.payload):status.payload
     assert.ok(statuses.some(s=>s.phase==='scanning'&&s.files>0&&s.completeFiles>0),JSON.stringify(statuses))
     assert.ok(statuses.some(s=>s.phase==='scanning'&&/^mysql-bin/.test(s.currentFile)))
     assert.equal(state.state,'caught-up',JSON.stringify({status:state,checkpoint:JSON.parse(await readFile(join(root,'owned/checkpoint.json'),'utf8'))}));assert.equal(state.pendingRecords,0)
     const [newValues]=await db.query("SELECT payload FROM control_escolar_audit_events WHERE event_type='student_update' AND source_flow='mysql_binlog_recovered'")
     assert.ok(newValues.some(row=>{const p=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;return p.changes.some(c=>c.before==='AMÉRICA'&&c.after==='ÁFRICA')}))
     await worker.run()
     assert.equal((await describeRecoverySource(db)).pendingRecords,0)
     assert.match(await readFile(join(root,'owned/checkpoint.json'),'utf8'),/completeFiles/)
    }finally{await worker.stop()}
   }
   console.log(JSON.stringify({source:inventory.version,file:file.name,recovered:records.length,verified:true,transport:'direct-mysql'}))
  })
 }finally{if(process.env.AUDIT_TEST_ISOLATED_SOURCE==='1')await db.query("DROP USER IF EXISTS '"+reader+"'@'%'");await db.query('DROP DATABASE IF EXISTS `'+schema+'`');await db.end();await rm(root,{recursive:true,force:true})}
})
