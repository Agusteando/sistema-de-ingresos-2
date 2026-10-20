// Pure orchestration. All platform I/O is injected so replay/failure semantics
// can be exercised without granting tests access to production containers.
import {createHash} from 'node:crypto'
const fail=code=>{throw Object.assign(new Error(code),{code})}
export const recoveryFileKey=(file,descriptor)=>[descriptor.serverUuid,descriptor.schemaFingerprint,file.name,file.headerSha256].join('|')
export async function recoverAuditSweep({descriptor,inventory,state,scan,apply,save,signal,budget=4,paused=()=>false}){
 if(descriptor.protocolVersion!==1||descriptor.serverUuid!==inventory.serverUuid)fail('AUDIT_SOURCE_SERVER_MISMATCH')
 if(!/^8\.4\./.test(inventory.version)||inventory.format!=='ROW'||inventory.rowImage!=='FULL'||inventory.checksum!=='CRC32'||Number(inventory.logBin)!==1||inventory.encrypted!==false)fail('AUDIT_SOURCE_FORMAT_UNSUPPORTED')
 if(!/^[A-Za-z0-9_]+$/.test(descriptor.schema)||!Array.isArray(descriptor.fields)||!descriptor.fields.length)fail('AUDIT_SOURCE_DESCRIPTOR_INVALID')
 const entries=state.files||{},next={version:1,sourceUuid:inventory.serverUuid,files:{...entries},oldestAvailableAt:state.sourceUuid===inventory.serverUuid?state.oldestAvailableAt||null:null,lastCommitAt:state.sourceUuid===inventory.serverUuid?state.lastCommitAt||null:null,errors:{...(state.sourceUuid===inventory.serverUuid?state.errors||{}:{})},state:'running'}
 const files=inventory.files
 if(!files.length)fail('AUDIT_SOURCE_LOGS_UNAVAILABLE')
 // Newest-to-oldest is mandatory: a DDL boundary discovered in a newer file
 // invalidates the current ordinal map for all older files.
 const newest=[...files].sort((a,b)=>b.name.localeCompare(a.name))
 let schemaBoundary=state.sourceUuid===inventory.serverUuid&&state.schemaFingerprint===descriptor.schemaFingerprint?state.schemaBoundary||null:null
 let worked=0,complete=0
 const ready=[]
 for(const file of newest){
  if(signal?.aborted||paused()){next.state='paused';break}
  if(!/^mysql-bin\.\d{6,}$/.test(file.name)||!/^\d+$/.test(String(file.size))||!/^([a-f0-9]{64})$/.test(file.headerSha256))fail('AUDIT_SOURCE_FILE_INVALID')
  const key=recoveryFileKey(file,descriptor),checkpoint=entries[key]
  if(schemaBoundary&&file.name<=schemaBoundary){next.errors[file.name]='AUDIT_SCHEMA_HISTORY_REQUIRED';continue}
  if(checkpoint?.size===String(file.size)&&checkpoint.complete){complete++;continue}
  ready.push(file)
 }
 // Prioritization affects scheduling only, never source/identity linkage.
 for(const file of ready.slice(0,budget)){
  if(signal?.aborted||paused()){next.state='paused';break}
  const key=recoveryFileKey(file,descriptor);worked++
  try{
   const result=await scan(file,descriptor,signal)
   let captured=false
   try{
    if(result.summary.ddl){schemaBoundary=!schemaBoundary||file.name>schemaBoundary?file.name:schemaBoundary;fail('AUDIT_SCHEMA_HISTORY_REQUIRED')}
    if(schemaBoundary&&file.name<=schemaBoundary)fail('AUDIT_SCHEMA_HISTORY_REQUIRED')
    let imported=0
    for await(const records of result.batches()){
     if(signal?.aborted||paused())fail('AUDIT_RECOVERY_PAUSED')
     const response=await apply({version:1,records},signal)
     if(response?.applied!==true||response.results?.length!==records.length||response.results.some(row=>!['imported','already-imported','already-verified','captured'].includes(row.status)))fail('AUDIT_RECOVERY_IMPORT_UNCONFIRMED')
     imported+=response.results.length
    }
    if(imported!==result.summary.count)fail('AUDIT_RECOVERY_SPOOL_MISMATCH')
    next.files[key]={complete:true,size:String(file.size),count:imported,firstEventAt:result.summary.firstEventAt,lastCommitAt:result.summary.lastCommitAt,commitPosition:result.summary.lastCommitPosition,at:new Date().toISOString()}
    if(result.summary.firstEventAt&&(!next.oldestAvailableAt||result.summary.firstEventAt<next.oldestAvailableAt))next.oldestAvailableAt=result.summary.firstEventAt
    if(result.summary.lastCommitAt&&(!next.lastCommitAt||result.summary.lastCommitAt>next.lastCommitAt))next.lastCommitAt=result.summary.lastCommitAt
    captured=true
    delete next.errors[file.name]
    complete++
   }finally{if(captured||result.summary.ddl)await result.cleanup()}
  }catch(error){next.errors[file.name]=String(error.code||'AUDIT_RECOVERY_SOURCE_FAILED');if(error.code==='AUDIT_RECOVERY_PAUSED')next.state='paused'}
  next.schemaBoundary=schemaBoundary;next.schemaFingerprint=descriptor.schemaFingerprint
  await save(next) // Only after a complete source scan and confirmed audit transaction.
 }
 // Preserve uncertainty even if a higher-priority newer file exposed a boundary
 // after older files had been queued; no ordinal-dependent import is permitted.
 const currentKeys=new Set(files.map(file=>recoveryFileKey(file,descriptor)))
 next.files=Object.fromEntries(Object.entries(next.files).filter(([key])=>currentKeys.has(key)))
 next.schemaBoundary=schemaBoundary;next.schemaFingerprint=descriptor.schemaFingerprint
 next.completeFiles=files.filter(file=>{const checkpoint=next.files[recoveryFileKey(file,descriptor)];return checkpoint?.complete&&checkpoint.size===String(file.size)}).length
 next.totalFiles=files.length
 next.retentionGap=Boolean(descriptor.oldestAudit&&next.oldestAvailableAt&&descriptor.oldestAudit<next.oldestAvailableAt)
 if(next.state!=='paused')next.state=Object.keys(next.errors).length?'error':next.completeFiles===files.length?(next.retentionGap?'retention-gap':'caught-up'):'running'
 next.updatedAt=new Date().toISOString();next.worked=worked
 await save(next)
 return next
}
export const sourceFingerprint=data=>createHash('sha256').update(data).digest('hex')

export const canonicalBinlogPreamble=bytes=>{
 const value=Buffer.from(bytes)
 if(value.length<80||value[0]!==254||value.subarray(1,4).toString()!=='bin'||value[8]!==15)fail('AUDIT_SOURCE_PREAMBLE_INVALID')
 const end=4+value.readUInt32LE(13)
 if(end>value.length||end<80)fail('AUDIT_SOURCE_PREAMBLE_INVALID')
 // MySQL clears BINLOG_IN_USE_F when closing a file. That lifecycle bit and
 // its FDE checksum do not indicate a different source file.
 value[21]&=254
 value.fill(0,end-4,end)
 return sourceFingerprint(value)
}
