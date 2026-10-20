import {createRequire} from 'node:module'
import {mkdir,readFile,rename,open} from 'node:fs/promises'
import {join} from 'node:path'
import {describeRecoverySource,recordRecoveryStatus} from './audit/service.mjs'
import {captureRecovery,retryRecoveryQueue} from '../shared/utils/auditRecoveryQueue.mjs'
import {importAuditRecovery} from './import-audit-recovery.mjs'
import {recoverAuditSweep,recoveryFileKey} from './audit/audit-recovery-engine.mjs'
import {withSourceOptions,downloadRaw,scanSourceFile,replayVerifiedSpools} from './audit/native-source.mjs'

const fail=code=>{throw Object.assign(Error(code),{code})}
export const sourceConfiguration=(e=process.env)=>({
 host:e.CONTROL_ESCOLAR_MYSQL_HOST,port:Number(e.CONTROL_ESCOLAR_MYSQL_PORT||3306),
 user:e.AUDIT_SOURCE_MYSQL_USER||e.CONTROL_ESCOLAR_MYSQL_USER,
 password:e.AUDIT_SOURCE_MYSQL_PASSWORD||e.CONTROL_ESCOLAR_MYSQL_PASSWORD,
 database:e.CONTROL_ESCOLAR_MYSQL_DATABASE,connectTimeout:10000,
 supportBigNumbers:true,bigNumberStrings:true,charset:'utf8mb4'
})

export async function readSourceInventory(db){
 const [[source]]=await db.query("SELECT @@server_uuid AS serverUuid,VERSION() AS version,@@global.binlog_format AS format,@@global.binlog_row_image AS rowImage,@@global.binlog_checksum AS checksum,@@global.log_bin AS logBin,@@global.binlog_encryption AS encrypted")
 const [rows]=await db.query('SHOW BINARY LOGS')
 const files=rows.map(row=>{
  const name=String(row.Log_name||''),size=String(row.File_size||'')
  if(!/^mysql-bin\.\d{6,}$/.test(name)||!/^\d+$/.test(size))fail('AUDIT_SOURCE_INVENTORY_INVALID')
  return {name,size}
 })
 // The server decrypts its own logs for authenticated remote reads. The local
 // files delivered by mysqlbinlog are plaintext and verified independently.
 return {...source,encrypted:false,files}
}

export function startAuditRecovery({environment=process.env,mysql:providedMysql,tool='/opt/audit-reader/mysqlbinlog',initialDelay=15000,interval=60000}={}){
 const root=environment.AUDIT_RECOVERY_DATA_DIR||'/app/audit-data',statePath=join(root,'checkpoint.json'),spools=join(root,'spools')
 const enabled=!['false','0','off'].includes(String(environment.AUDIT_RECOVERY_ENABLED||'true').toLowerCase())
 let pending=null,controller=null,timer=null,startup=null,stopped=false
 const readState=async()=>{try{return JSON.parse(await readFile(statePath,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;return {version:1,files:{}}}}
 const saveState=async state=>{
  await mkdir(root,{recursive:true,mode:0o700})
  const path=statePath+'.tmp',handle=await open(path,'w',0o600)
  try{await handle.writeFile(JSON.stringify(state));await handle.sync()}finally{await handle.close()}
  await rename(path,statePath)
  const directory=await open(root,'r');try{await directory.sync()}finally{await directory.close()}
 }
 const tick=async()=>{
  if(!enabled||stopped)return
  controller=new AbortController();const signal=controller.signal
  let db,source,lease=false,descriptor,statusSnapshot
  const abort=()=>{source?.destroy();db?.destroy()}
  signal.addEventListener('abort',abort,{once:true})
  try{
   const mysql=providedMysql||createRequire(environment.AUDIT_APP_ENTRY||'/app/.output/server/index.mjs')('mysql2/promise')
   const connection=sourceConfiguration(environment)
   db=await mysql.createConnection({...connection,user:environment.CONTROL_ESCOLAR_MYSQL_USER,password:environment.CONTROL_ESCOLAR_MYSQL_PASSWORD})
   if(signal.aborted)fail('AUDIT_RECOVERY_PAUSED')
   const [[lock]]=await db.query({sql:"SELECT GET_LOCK('aurora-audit-owner-v2',0) AS acquired",timeout:10000})
   lease=Number(lock.acquired)===1;if(!lease)return
   descriptor=await describeRecoverySource(db)
   // Already verified evidence must remain usable even while source access or
   // another source file is unavailable. Account linking waits for coverage.
   await replayVerifiedSpools(spools,descriptor.serverUuid,bundle=>captureRecovery(db,bundle))
   await retryRecoveryQueue(db,importAuditRecovery,{deferAttribution:true})
   source=await mysql.createConnection(connection)
   const inventory=await readSourceInventory(source)
   if(inventory.serverUuid!==descriptor.serverUuid)fail('AUDIT_SOURCE_SERVER_MISMATCH')
   if(!/^8\.4\.11(?:-|$)/.test(inventory.version))fail('AUDIT_SOURCE_READER_VERSION_MISMATCH')
   const state=await readState()
   const publish=async(snapshot,extra={})=>{
    statusSnapshot={...snapshot,...extra,version:1,sourceUuid:inventory.serverUuid,files:inventory.files.length,pendingRecords:(await describeRecoverySource(db)).pendingRecords}
    return recordRecoveryStatus(db,statusSnapshot)
   }
   await publish(state,{state:'running',phase:'checking-source',currentFile:''})
   await withSourceOptions(spools,connection,async optionsFile=>{
    // Source preambles distinguish log-name reuse; no host file/socket access.
    for(const file of inventory.files){
     try{
      const prefix=await downloadRaw({tool,optionsFile,file,root:spools,signal,preambleOnly:true})
      try{file.headerSha256=prefix.headerSha256}finally{await prefix.cleanup()}
     }catch(error){if(signal.aborted)throw error;file.sourceError=String(error.code||'AUDIT_SOURCE_READ_FAILED')}
    }
    let currentFile=''
    const progress=async snapshot=>{
     const completeFiles=inventory.files.filter(file=>{const item=snapshot.files?.[recoveryFileKey(file,descriptor)];return item?.complete&&item.size===String(file.size)}).length
     await saveState({...snapshot,completeFiles,totalFiles:inventory.files.length})
     // Publish proven values after each committed file, not after a multi-file pass.
     await retryRecoveryQueue(db,importAuditRecovery,{deferAttribution:true})
     await publish(snapshot,{state:'running',phase:'scanning',completeFiles,currentFile})
    }
    const result=await recoverAuditSweep({descriptor,inventory,state,signal,budget:4,
     scan:async(file,shape,s)=>{
      currentFile=file.name
      await publish(await readState(),{state:'running',phase:'scanning',currentFile:file.name})
      return scanSourceFile(file,shape,s,{tool,optionsFile,root:spools,readDescriptor:()=>describeRecoverySource(db)})
     },
     apply:bundle=>captureRecovery(db,bundle),save:progress})
    const ready=result.completeFiles===result.totalFiles&&!Object.keys(result.errors).length
    await retryRecoveryQueue(db,importAuditRecovery,{deferAttribution:!ready})
    result.pendingRecords=(await describeRecoverySource(db)).pendingRecords
    if(ready&&result.pendingRecords){result.state='error';result.code='AUDIT_RECOVERY_PENDING'}
    await saveState(result)
    await recordRecoveryStatus(db,{...result,version:1,sourceUuid:inventory.serverUuid,files:result.totalFiles,phase:'idle',currentFile:'',code:result.code||Object.values(result.errors)[0]||''})
   })
  }catch(error){
   const denied=['ER_SPECIFIC_ACCESS_DENIED_ERROR','ER_ACCESS_DENIED_ERROR'].includes(error.code)
   const code=denied?'AUDIT_SOURCE_READ_PERMISSION_REQUIRED':String(error.code||'AUDIT_RECOVERY_FAILED')
   if(lease&&!signal.aborted)await recordRecoveryStatus(db,{...statusSnapshot,version:1,state:'error',phase:'error',sourceUuid:descriptor?.serverUuid,pendingRecords:await describeRecoverySource(db).then(s=>s.pendingRecords).catch(()=>0),code}).catch(()=>{})
   console.warn('[audit-recovery]',{code})
  }finally{
   signal.removeEventListener('abort',abort)
   if(lease)await db.query({sql:"SELECT RELEASE_LOCK('aurora-audit-owner-v2')",timeout:5000}).catch(()=>{})
   await Promise.allSettled([source?.end(),db?.end()].filter(Boolean));controller=null
  }
 }
 const run=()=>{if(pending)return pending;pending=tick().finally(()=>{pending=null});return pending}
 if(enabled){startup=setTimeout(()=>void run(),initialDelay);startup.unref?.();timer=setInterval(()=>void run(),interval);timer.unref?.()}
 return {run,async stop(){stopped=true;clearTimeout(startup);clearInterval(timer);controller?.abort();await pending}}
}
