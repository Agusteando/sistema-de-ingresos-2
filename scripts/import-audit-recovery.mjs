// Operator-only CLI. Reads JSON evidence on stdin; never exposes an HTTP write endpoint.
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {validateBinlogRecovery,recoverySourceKey,selectRecoveryTarget,parseAuditPayload,canonicalRecoveryField,recoveryError} from '../shared/utils/auditRecovery.mjs'
const digest=value=>createHash('sha256').update(value).digest('hex')
const literal=value=>value===null?'NULL':"'"+String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\0/g,'\\0').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')+"'"
export const importAuditRecovery=async(connection,bundle,{apply=false,sourceAmbiguous=false,deferAttribution=false}={})=>{
 if(bundle?.version!==1||!Array.isArray(bundle.records)||!bundle.records.length||bundle.records.length>1000)throw recoveryError('INVALID_RECOVERY_BUNDLE','Provide 1 to 1000 source records')
 const records=bundle.records.map(sourceRecord=>({sourceRecord,item:validateBinlogRecovery(sourceRecord)}))
 const [[database]]=await connection.query('SELECT DATABASE() AS name')
 if(records.some(({item})=>item.evidence.schema!==database.name))throw recoveryError('RECOVERY_DATABASE_MISMATCH','Evidence belongs to another database')
 const [columns]=await connection.query("SELECT COLUMN_NAME,ORDINAL_POSITION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='matricula'")
 for(const {item} of records){
  const identity=columns.find(column=>Number(column.ORDINAL_POSITION)===item.evidence.identityOrdinal)
  const field=columns.find(column=>Number(column.ORDINAL_POSITION)===item.evidence.fieldOrdinal)
  const primary=columns.find(column=>Number(column.ORDINAL_POSITION)===1)
  if(identity?.COLUMN_NAME!=='matricula'||primary?.COLUMN_NAME!=='id'||canonicalRecoveryField(field?.COLUMN_NAME)!==canonicalRecoveryField(item.field))throw recoveryError('RECOVERY_COLUMN_MAP_MISMATCH','Source field map does not match the student schema')
 }
 const [[lock]]=await connection.query("SELECT GET_LOCK('aurora-audit-recovery-v1',10) AS acquired")
 if(Number(lock.acquired)!==1)throw recoveryError('RECOVERY_BUSY','Another recovery is in progress')
 const results=[]
 try{
  await connection.beginTransaction()
  for(const {sourceRecord,item} of records){
   const fingerprint=digest(recoverySourceKey(item))
   const [existing]=await connection.execute("SELECT id,payload FROM control_escolar_audit_events WHERE event_type IN ('student_update_recovery','student_update') AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.fingerprint')) = ? FOR UPDATE",[fingerprint])
   let projection=null
   if(existing.length){
    const saved=validateBinlogRecovery(parseAuditPayload(existing[0].payload).sourceRecord)
    if(saved.matricula!==item.matricula||saved.recordedAt!==item.recordedAt||saved.rowId!==item.rowId||saved.before!==item.before||saved.after!==item.after||['endPosition','commitPosition','xid','crc32','decodedRowSha256'].some(key=>saved.evidence[key]!==item.evidence[key]))throw recoveryError('RECOVERY_SOURCE_CONFLICT','The same source position has conflicting evidence')
    const stored=parseAuditPayload(existing[0].payload)
    if(stored.recoveryVersion===1&&!stored.originalEventId&&!deferAttribution)projection=existing[0]
    else{results.push({matricula:item.matricula,field:item.field,status:'already-imported',recoveryEventId:String(existing[0].id),attributionPending:deferAttribution&&!stored.originalEventId});continue}
   }
   const [students]=await connection.execute('SELECT id FROM matricula WHERE UPPER(matricula) = ?',[item.matricula])
   if(students.length!==1||String(students[0].id)!==item.rowId)throw recoveryError('RECOVERY_STUDENT_MISMATCH','Source primary key does not match the student')
   const [anchors]=await connection.execute("SELECT id,event_type,matricula,plantel,ciclo,actor_email,actor_name,actor_role,source_flow,payload,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS recorded_at FROM control_escolar_audit_events WHERE event_type = 'student_update' AND COALESCE(source_flow,'') <> 'mysql_binlog_recovered' AND matricula = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 SECOND) FOR UPDATE",[item.matricula,item.recordedAt,item.recordedAt])
   let target=selectRecoveryTarget(item,anchors)
   if(deferAttribution&&target.kind!=='already-verified')target={kind:'unattributed',candidates:anchors.map(row=>String(row.id))}
   if(sourceAmbiguous&&target.kind==='linked')target={kind:'unattributed',candidates:[String(target.row.id)]}
   if(target.kind==='conflict')throw recoveryError('RECOVERY_LEDGER_CONFLICT','Source values conflict with an existing detailed audit record')
   if(target.kind==='already-verified'&&projection)target={kind:'linked',row:target.row}
   if(target.kind==='already-verified'){results.push({matricula:item.matricula,field:item.field,status:'already-verified',originalEventId:String(target.row.id)});continue}
   const linked=target.kind==='linked',original=linked?target.row:null
   if(original){
    const [overlays]=await connection.execute("SELECT id, payload FROM control_escolar_audit_events WHERE event_type = 'student_update_recovery' AND matricula = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.originalEventId')) = ? FOR UPDATE",[item.matricula,String(original.id)])
    if(overlays.some(overlay=>canonicalRecoveryField(parseAuditPayload(overlay.payload).sourceRecord?.field)===canonicalRecoveryField(item.field)))throw recoveryError('RECOVERY_TARGET_ALREADY_LINKED','This audit field already has another source link; review the source ambiguity')
   }
   if(projection&&!linked){results.push({matricula:item.matricula,field:item.field,status:'already-imported',recoveryEventId:String(projection.id),attributionPending:false});continue}
   const prefix=item.matricula.match(/^[A-Z]+/)[0],plantel=original?.plantel||(['PMA','PMB'].includes(prefix)?'PM':prefix)
   const sanitized={...sourceRecord,beforeSql:literal(item.before),afterSql:literal(item.after),evidence:{...item.evidence,rawBeforeSqlSha256:digest(sourceRecord.beforeSql),rawAfterSqlSha256:digest(sourceRecord.afterSql)}}
   validateBinlogRecovery(sanitized)
   const payload={version:2,recoveryVersion:1,fingerprint,originalEventId:original?String(original.id):null,actorEvidence:linked?'existing-audit-record':'unresolved',linkage:linked?'unique-student-field-second':'unresolved',candidateEventIds:target.candidates||[],sourceRecord:sanitized,fields:[item.field],changes:[{field:item.field,before:item.before,after:item.after}]}
   let recoveryEventId=null
   if(apply&&projection){
    const prior=parseAuditPayload(projection.payload)
    const promoted={...prior,originalEventId:String(original.id),actorEvidence:'existing-audit-record',linkage:'unique-student-field-second',candidateEventIds:[]}
    const [updated]=await connection.execute("UPDATE control_escolar_audit_events SET event_type='student_update_recovery',plantel=?,ciclo=?,source_flow='audit_recovery_import',payload=? WHERE id=? AND event_type='student_update' AND source_flow='mysql_binlog_recovered' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.fingerprint'))=?",[original.plantel,original.ciclo||'',JSON.stringify(promoted),projection.id,fingerprint])
    if(Number(updated.affectedRows)!==1)throw recoveryError('RECOVERY_PROJECTION_PROMOTION_CONFLICT','Owned recovery projection changed during linking')
    recoveryEventId=String(projection.id)
   }else if(apply){
    const [insert]=await connection.execute("INSERT INTO control_escolar_audit_events (event_type,plantel,ciclo,matricula,actor_email,actor_name,actor_role,summary,source_base,source_flow,payload,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[linked?'student_update_recovery':'student_update',plantel,original?.ciclo||'',item.matricula,null,linked?'Recuperación de auditoría':'Sin identificar','operator_recovery','Evidencia histórica de '+item.field,'MYSQL_BINLOG',linked?'audit_recovery_import':'mysql_binlog_recovered',JSON.stringify(payload),item.recordedAt])
    recoveryEventId=String(insert.insertId)
   }
   results.push({matricula:item.matricula,field:item.field,status:apply?'imported':'preview',originalEventId:original?String(original.id):null,recoveryEventId,attribution:payload.actorEvidence,attributionPending:deferAttribution&&!linked,candidates:target.candidates||[],before:item.before,after:item.after,fingerprint})
  }
  if(apply)await connection.commit();else await connection.rollback()
  return {applied:apply,results}
 }catch(error){await connection.rollback().catch(()=>{});throw error}
 finally{await connection.query("SELECT RELEASE_LOCK('aurora-audit-recovery-v1')").catch(()=>{})}
}
const main=async()=>{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2000000)throw Error('Evidence bundle too large')}
 const require=createRequire(process.env.AUDIT_APP_ENTRY||'/app/.output/server/index.mjs'),mysql=require('mysql2/promise'),e=process.env
 const connection=await mysql.createConnection({host:e.CONTROL_ESCOLAR_MYSQL_HOST,port:Number(e.CONTROL_ESCOLAR_MYSQL_PORT||3306),user:e.CONTROL_ESCOLAR_MYSQL_USER,password:e.CONTROL_ESCOLAR_MYSQL_PASSWORD,database:e.CONTROL_ESCOLAR_MYSQL_DATABASE,connectTimeout:10000})
 try{console.log(JSON.stringify(await importAuditRecovery(connection,JSON.parse(input),{apply:process.argv.includes('--apply')}),null,2))}finally{await connection.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({code:error.code||'RECOVERY_FAILED',message:error.message}));process.exitCode=1})
