// Trusted control-plane CLI only. No HTTP mutation surface or root DB credentials.
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {recoverableAuditColumns} from '../shared/utils/auditSourceFields.mjs'
import {captureRecovery,retryRecoveryQueue} from '../shared/utils/auditRecoveryQueue.mjs'
import {importAuditRecovery} from './import-audit-recovery.mjs'
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
 const summary={version:1,state:status.state,sourceUuid:String(status.sourceUuid||'').slice(0,60),oldestAvailableAt:status.oldestAvailableAt||null,lastCommitAt:status.lastCommitAt||null,files:Number(status.files||0),completeFiles:Number(status.completeFiles||0),pendingRecords:Number(status.pendingRecords||0),retentionGap:status.retentionGap===true,code:String(status.code||'').slice(0,80),updatedAt:new Date().toISOString()}
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
const main=async()=>{
 const args=process.argv.slice(2);let raw=''
 if(!args.includes('--describe'))for await(const chunk of process.stdin){raw+=chunk;if(raw.length>2000000)throw Error('RECOVERY_INPUT_LIMIT')}
 const require=createRequire(process.env.AUDIT_APP_ENTRY||'/app/.output/server/index.mjs'),mysql=require('mysql2/promise'),e=process.env
 const db=await mysql.createConnection({host:e.CONTROL_ESCOLAR_MYSQL_HOST,port:Number(e.CONTROL_ESCOLAR_MYSQL_PORT||3306),user:e.CONTROL_ESCOLAR_MYSQL_USER,password:e.CONTROL_ESCOLAR_MYSQL_PASSWORD,database:e.CONTROL_ESCOLAR_MYSQL_DATABASE,connectTimeout:10000})
 try{console.log(JSON.stringify(await runRecoveryService(db,args,raw?JSON.parse(raw):null)))}finally{await db.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({code:error.code||'AUDIT_RECOVERY_SERVICE_FAILED',message:error.message}));process.exitCode=1})
