// Durable operational inbox. Only committed, validated source records enter it;
// it is separate from the immutable student audit projection.
import {createHash} from 'node:crypto'
import {validateBinlogRecovery,recoverySourceKey,parseAuditPayload} from './auditRecovery.mjs'
import {recoverableAuditColumns} from './auditSourceFields.mjs'
const fingerprint=source=>createHash('sha256').update(recoverySourceKey(validateBinlogRecovery(source))).digest('hex')
export async function enqueueRecovery(db,bundle){
 if(bundle?.version!==1||!Array.isArray(bundle.records)||!bundle.records.length||bundle.records.length>1000)throw Error('INVALID_RECOVERY_BUNDLE')
 const prepared=bundle.records.map(source=>{
  const item=validateBinlogRecovery(source)
  if(!recoverableAuditColumns.has(item.field)||!item.evidence.sourceServerUuid||!item.evidence.sourceFileHeaderSha256)throw Error('AUDIT_QUEUE_SOURCE_INVALID')
  if(JSON.stringify(source).length>1000000)throw Error('AUDIT_QUEUE_RECORD_LIMIT')
  return {source,item,fingerprint:fingerprint(source)}
 })
 const [[identity]]=await db.query('SELECT DATABASE() AS name,@@server_uuid AS serverUuid')
 if(prepared.some(row=>row.item.evidence.schema!==identity.name||row.item.evidence.sourceServerUuid!==identity.serverUuid))throw Error('AUDIT_QUEUE_SOURCE_SERVER_MISMATCH')
 const [[lock]]=await db.query("SELECT GET_LOCK('aurora-audit-queue-v1',10) AS acquired")
 if(Number(lock.acquired)!==1)throw Error('AUDIT_QUEUE_BUSY')
 try{
  await db.beginTransaction()
  for(const row of prepared){
   const [existing]=await db.execute("SELECT id,payload FROM control_escolar_audit_events WHERE event_type IN ('audit_recovery_pending','student_update_recovery','student_update') AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.fingerprint'))=? LIMIT 1",[row.fingerprint])
   if(existing.length){
    const saved=validateBinlogRecovery(parseAuditPayload(existing[0].payload).sourceRecord)
    if(saved.matricula!==row.item.matricula||saved.recordedAt!==row.item.recordedAt||saved.before!==row.item.before||saved.after!==row.item.after||saved.rowId!==row.item.rowId||['crc32','endPosition','commitPosition','xid','decodedRowSha256','sourceServerUuid','sourceFileHeaderSha256'].some(key=>saved.evidence[key]!==row.item.evidence[key]))throw Error('AUDIT_QUEUE_SOURCE_CONFLICT')
    continue
   }
   const prefix=row.item.matricula.match(/^[A-Z]+/)[0],plantel=['PMA','PMB'].includes(prefix)?'PM':prefix
   await db.execute("INSERT INTO control_escolar_audit_events(event_type,plantel,ciclo,matricula,actor_name,actor_role,summary,source_base,source_flow,payload,created_at) VALUES('audit_recovery_pending',?,'',?,'Sistema','system','Evidencia histórica pendiente','MYSQL_BINLOG','audit_recovery_service',?,NOW())",[plantel,row.item.matricula,JSON.stringify({version:1,state:'pending',fingerprint:row.fingerprint,sourceRecord:row.source})])
  }
  await db.commit()
 }catch(error){await db.rollback().catch(()=>{});throw error}
 finally{await db.query("SELECT RELEASE_LOCK('aurora-audit-queue-v1')").catch(()=>{})}
 return prepared
}
export async function captureRecovery(db,bundle){
 const rows=await enqueueRecovery(db,bundle)
 return {applied:true,results:rows.map(row=>({matricula:row.item.matricula,field:row.item.field,status:'captured'}))}
}
export async function drainRecoveryRows(db,rows,importer){
 const results=[]
 for(const row of rows){
  const payload=parseAuditPayload(row.payload),source=payload.sourceRecord
  try{
   const [[count]]=await db.execute("SELECT COUNT(*) AS count FROM control_escolar_audit_events WHERE event_type='audit_recovery_pending' AND matricula=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.sourceRecord.field'))=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.sourceRecord.recordedAt'))=?",[source.matricula,source.field,source.recordedAt])
   const result=await importer(db,{version:1,records:[source]},{apply:true,sourceAmbiguous:Number(count.count)>1})
   if(result.applied!==true||result.results?.length!==1||!['imported','already-imported','already-verified'].includes(result.results[0].status))throw Error('AUDIT_QUEUE_IMPORT_UNCONFIRMED')
   await db.execute("UPDATE control_escolar_audit_events SET payload=JSON_SET(JSON_REMOVE(payload,'$.lastError'),'$.state','applied'),created_at=NOW() WHERE event_type='audit_recovery_pending' AND source_flow='audit_recovery_service' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.fingerprint'))=?",[payload.fingerprint])
   results.push(result.results[0])
  }catch(error){
   const code=String(error.code||error.message||'AUDIT_RECOVERY_FAILED').slice(0,80)
   // Updating only the operational inbox keeps failures retryable after source
   // log expiry. Original audit events and source facts remain untouched.
   await db.execute("UPDATE control_escolar_audit_events SET payload=JSON_SET(payload,'$.lastError',?,'$.lastAttemptAt',?),created_at=NOW() WHERE event_type='audit_recovery_pending' AND source_flow='audit_recovery_service' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.fingerprint'))=?",[code,new Date().toISOString(),payload.fingerprint])
   results.push({matricula:source.matricula,field:source.field,status:'queued',code})
  }
 }
 return {applied:true,results}
}
export async function retryRecoveryQueue(db,importer){
 const [rows]=await db.query("SELECT id,payload FROM control_escolar_audit_events WHERE event_type='audit_recovery_pending' AND source_flow='audit_recovery_service' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.state')),'pending') <> 'applied' ORDER BY created_at,id LIMIT 1000")
 return drainRecoveryRows(db,rows,importer)
}
