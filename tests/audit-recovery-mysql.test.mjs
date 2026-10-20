import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {captureRecovery,retryRecoveryQueue} from '../shared/utils/auditRecoveryQueue.mjs'
import {describeRecoverySource,recordRecoveryStatus} from '../scripts/audit-recovery-service.mjs'
import {importAuditRecovery} from '../scripts/import-audit-recovery.mjs'
import {indexAuditRecoveries} from '../shared/utils/auditRecovery.mjs'

test('real MySQL: durable capture, idempotent replay, projection, account ambiguity and status isolation', {skip:!process.env.AUDIT_TEST_MYSQL_URL}, async()=>{
 const mysql=await import('mysql2/promise')
 const db=await mysql.createConnection(process.env.AUDIT_TEST_MYSQL_URL)
 const schema='audit_recovery_ci_'+process.pid
 try{
  await db.query('CREATE DATABASE `'+schema+'` CHARACTER SET utf8mb4')
  await db.query('USE `'+schema+'`')
  await db.query('CREATE TABLE matricula(id INT PRIMARY KEY,matricula VARCHAR(255),grupo VARCHAR(255))')
  await db.query(`CREATE TABLE control_escolar_audit_events(id BIGINT AUTO_INCREMENT PRIMARY KEY,event_type VARCHAR(64),plantel VARCHAR(20),ciclo VARCHAR(20),matricula VARCHAR(255),actor_email VARCHAR(255),actor_name VARCHAR(255),actor_role VARCHAR(80),summary TEXT,source_base VARCHAR(80),source_flow VARCHAR(180),payload JSON,created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),INDEX(event_type,matricula,created_at))`)
  await db.execute('INSERT INTO matricula VALUES(42,?,?)',['TX9876','AMÉRICA'])
  const [insert]=await db.execute("INSERT INTO control_escolar_audit_events(event_type,plantel,ciclo,matricula,actor_email,actor_name,source_flow,payload,created_at) VALUES('student_update','TX','2026','TX9876','account@example.test','Recorded account','student_patch_matricula_overlay',?,'2026-10-14 13:59:53')",[JSON.stringify({fields:['grupo']})])
  const [original]=await db.query('SELECT *,DATE_FORMAT(created_at,\'%Y-%m-%d %H:%i:%s.%f\') AS recorded_at FROM control_escolar_audit_events WHERE id='+insert.insertId)
  const snapshot=JSON.stringify(original)
  const description=await describeRecoverySource(db)
  const template=JSON.parse(readFileSync(new URL('./fixtures/audit-recovery-pm1626.json',import.meta.url),'utf8')).records[0]
  const record={...template,matricula:'TX9876',rowId:'42',evidence:{...template.evidence,schema,identityOrdinal:2,fieldOrdinal:3,sourceServerUuid:description.serverUuid,sourceFileHeaderSha256:'a'.repeat(64)}}
  const bundle={version:1,records:[record]}
  await captureRecovery(db,bundle)
  await captureRecovery(db,bundle)
  assert.equal((await describeRecoverySource(db)).pendingRecords,1)
  const applied=await retryRecoveryQueue(db,importAuditRecovery)
  assert.equal(applied.results[0].status,'imported')
  assert.equal((await describeRecoverySource(db)).pendingRecords,0)
  assert.deepEqual((await retryRecoveryQueue(db,importAuditRecovery)).results,[])
  const [recovered]=await db.query("SELECT * FROM control_escolar_audit_events WHERE event_type='student_update_recovery'")
  const projection=indexAuditRecoveries(original,recovered).get(String(insert.insertId)+'|grupo')
  assert.equal(projection.before,'ANTÁRTIDA');assert.equal(projection.after,'AMÉRICA')
  const [after]=await db.query('SELECT *,DATE_FORMAT(created_at,\'%Y-%m-%d %H:%i:%s.%f\') AS recorded_at FROM control_escolar_audit_events WHERE id='+insert.insertId)
  assert.equal(JSON.stringify(after),snapshot)
  await recordRecoveryStatus(db,{version:1,state:'running'})
  await recordRecoveryStatus(db,{version:1,state:'caught-up'})
  const [[status]]=await db.query("SELECT COUNT(*) AS count FROM control_escolar_audit_events WHERE event_type='audit_recovery_status'")
  assert.equal(status.count,1)
  // A different student has two committed writes in the same second and only
  // one account observation. Both values survive; neither borrows that actor.
  await db.execute('INSERT INTO matricula VALUES(43,?,?)',['TX9877','B'])
  await db.execute("INSERT INTO control_escolar_audit_events(event_type,plantel,matricula,payload,created_at) VALUES('student_update','TX','TX9877',?,'2026-10-14 13:59:53')",[JSON.stringify({fields:['grupo']})])
  const one={...record,matricula:'TX9877',rowId:'43',beforeSql:"'A'",afterSql:"''",evidence:{...record.evidence,position:'500848403'}}
  const two={...one,beforeSql:"''",afterSql:"'B'",evidence:{...one.evidence,position:'500848404'}}
  await captureRecovery(db,{version:1,records:[one,two]})
  const multiple=await retryRecoveryQueue(db,importAuditRecovery)
  assert.equal(multiple.results.length,2)
  assert.ok(multiple.results.every(row=>row.status==='imported'&&row.attribution==='unresolved'))
  assert.equal((await describeRecoverySource(db)).pendingRecords,0)
 }finally{await db.query('DROP DATABASE IF EXISTS `'+schema+'`');await db.end()}
})
