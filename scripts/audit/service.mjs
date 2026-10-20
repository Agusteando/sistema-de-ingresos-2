// Internal Aurora audit service. No external controller CLI or root credentials.
import {createHash} from 'node:crypto'
import {recoverableAuditColumns} from '../../shared/utils/auditSourceFields.mjs'
import {captureRecovery,retryRecoveryQueue} from '../../shared/utils/auditRecoveryQueue.mjs'
import {importAuditRecovery} from '../import-audit-recovery.mjs'
export const describeRecoverySource=async db=>{
 const [[source]]=await db.query('SELECT DATABASE() AS schemaName,@@server_uuid AS serverUuid,VERSION() AS version')
 const [columns]=await db.query("SELECT COLUMN_NAME AS name,ORDINAL_POSITION AS ordinal,COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='matricula' ORDER BY ORDINAL_POSITION")
 if(columns.find(c=>Number(c.ordinal)===1)?.name!=='id'||!columns.some(c=>c.name==='matricula'))throw Error('RECOVERY_COLUMN_MAP_MISMATCH')
 const [[range]]=await db.query("SELECT DATE_FORMAT(MIN(created_at),'%Y-%m-%d %H:%i:%s') AS oldestAudit FROM control_escolar_audit_events WHERE event_type='student_update'")
 const fields=columns.filter(c=>recoverableAuditColumns.has(c.name)).map(c=>({name:c.name,ordinal:Number(c.ordinal),type:c.type}))
 const shape={schema:source.schemaName,serverUuid:source.serverUuid,version:source.version,identityOrdinal:Number(columns.find(c=>c.name==='matricula').ordinal),columnCount:columns.length,fields}
 const [[queue]]=await db.query("SELECT COUNT(*) AS count FROM control_escolar_audit_events WHERE event_type='audit_recovery_pending' AND source_flow='audit_recovery_service' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.state')),'pending') <> 'applied'")
 return {protocolVersion:1,...shape,pendingRecords:Number(queue.count||0),oldestAudit:range.oldestAudit,schemaFingerprint:createHash('sha256').update(JSON.stringify(shape)).digest('hex')}
}
export const recordRecoveryStatus=async(db,status)=>{
 if(!status||status.version!==1||!['running','caught-up','error','paused','retention-gap'].includes(status.state)||JSON.stringify(status).length>16000)throw Error('INVALID_RECOVERY_STATUS')
 const failedFile=Object.keys(status.errorDetails||{}).sort().reverse()[0]
 const lastFailure=failedFile?{file:failedFile,...status.errorDetails[failedFile]}:null
 const summary={lastFailure,version:1,state:status.state,sourceUuid:String(status.sourceUuid||'').slice(0,60),oldestAvailableAt:status.oldestAvailableAt||null,lastCommitAt:status.lastCommitAt||null,files:Number(status.files||0),completeFiles:Number(status.completeFiles||0),pendingRecords:Number(status.pendingRecords||0),retentionGap:status.retentionGap===true,schemaGuardVersion:Number(status.schemaGuardVersion||0),schemaBoundary:/^mysql-bin\.\d{6,}$/.test(status.schemaBoundary||'')?status.schemaBoundary:null,code:String(status.code||'').slice(0,80),phase:String(status.phase||'').slice(0,40),currentFile:/^mysql-bin\.\d{6,}$/.test(status.currentFile||'')?status.currentFile:'',updatedAt:new Date().toISOString()}
 const [previous]=await db.query("SELECT id FROM control_escolar_audit_events WHERE event_type='audit_recovery_status' AND source_flow='audit_recovery_service' ORDER BY id DESC LIMIT 1")
 if(previous.length){await db.execute("UPDATE control_escolar_audit_events SET payload=?,created_at=NOW() WHERE id=? AND event_type='audit_recovery_status' AND source_flow='audit_recovery_service'",[JSON.stringify(summary),previous[0].id]);return summary}
 await db.execute("INSERT INTO control_escolar_audit_events(event_type,plantel,ciclo,matricula,actor_name,actor_role,summary,source_base,source_flow,payload,created_at) VALUES('audit_recovery_status','','',NULL,'Sistema','system','Recuperación histórica','MYSQL_BINLOG','audit_recovery_service',?,NOW())",[JSON.stringify(summary)])
 return summary
}
export const runRecoveryService=async(db,args,input)=>{
 if(args.includes('--describe'))return describeRecoverySource(db)
 if(args.includes('--status'))return recordRecoveryStatus(db,input)
 if(args.includes('--capture'))return captureRecovery(db,input)
 if(args.includes('--retry'))return retryRecoveryQueue(db,importAuditRecovery)
 if(args.includes('--apply'))return importAuditRecovery(db,input,{apply:true})
 throw Error('RECOVERY_MODE_REQUIRED')
}
