import {spawn} from 'node:child_process'
import {setPriority} from 'node:os'
import {createReadStream} from 'node:fs'
import {mkdtemp,open,readFile,writeFile,rename,rm,mkdir,stat,readdir,lstat,truncate} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {decodeAuditBinlog,utf8Lines} from './audit-binlog-decoder.mjs'
import {createAuditSchemaGuard} from './audit-binlog-guard.mjs'
import {canonicalBinlogPreamble} from './audit-recovery-engine.mjs'

const fail=code=>{throw Object.assign(new Error(code),{code})}
const option=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r')+'"'

// Credentials live in a private temporary option file, never argv or logs.
export async function withSourceOptions(root,connection,fn){
 await mkdir(root,{recursive:true,mode:0o700})
 const directory=await mkdtemp(join(root,'credentials-'))
 try{
  const path=join(directory,'source.cnf')
  await writeFile(path,'[client]\nhost='+option(connection.host)+'\nport='+Number(connection.port||3306)+'\nuser='+option(connection.user)+'\npassword='+option(connection.password)+'\n',{mode:0o600})
  return await fn(path)
 }finally{await rm(directory,{recursive:true,force:true})}
}

export async function runReader(tool,args,{signal,stdout,timeout=600000}={}){
 if(signal?.aborted)fail('AUDIT_RECOVERY_PAUSED')
 const child=spawn(tool,args,{stdio:['ignore',stdout?'pipe':'ignore','pipe'],env:{...process.env,TZ:'UTC'},shell:false})
 try{setPriority(child.pid,19)}catch{/* Correctness does not require scheduler privileges. */}
 let diagnostic='',timedOut=false
 child.stderr.on('data',chunk=>{if(diagnostic.length<4000)diagnostic+=chunk.toString().slice(0,4000-diagnostic.length)})
 const stop=()=>child.kill('SIGKILL')
 const deadline=setTimeout(()=>{timedOut=true;stop()},timeout);deadline.unref?.();signal?.addEventListener('abort',stop,{once:true})
 let consumed,exited
 try{
  exited=new Promise((resolve,reject)=>{
   child.once('error',()=>reject(Object.assign(Error('AUDIT_READER_UNAVAILABLE'),{code:'AUDIT_READER_UNAVAILABLE'})))
   child.once('close',(code,exitSignal)=>{
    if(code===0)return resolve()
    const reason=signal?.aborted?'AUDIT_RECOVERY_PAUSED':timedOut?'AUDIT_SOURCE_READ_TIMEOUT':
     /1227|Access denied|REPLICATION/i.test(diagnostic)?'AUDIT_SOURCE_READ_PERMISSION_REQUIRED':
     /1236|Could not find first log|not found in binary log index/i.test(diagnostic)?'AUDIT_SOURCE_LOG_UNAVAILABLE':
     /No space left on device/i.test(diagnostic)?'AUDIT_SOURCE_DISK_FULL':
     /2003|2006|2013|Lost connection|Can.t connect/i.test(diagnostic)?'AUDIT_SOURCE_CONNECTION_FAILED':
     /checksum|CRC/i.test(diagnostic)?'AUDIT_SOURCE_CHECKSUM_FAILED':'AUDIT_SOURCE_READ_FAILED'
    reject(Object.assign(Error(reason),{code:reason,readerExitCode:code,readerSignal:exitSignal||null}))
   })
  })
  exited.catch(()=>{})
  consumed=stdout?stdout(child.stdout):Promise.resolve()
  await Promise.all([exited,consumed])
 }catch(error){stop();await Promise.allSettled([consumed,exited].filter(Boolean));throw error}
 finally{clearTimeout(deadline);signal?.removeEventListener('abort',stop)}
}

export async function downloadRaw({tool,optionsFile,file,root,signal,preambleOnly=false}){
 if(!/^mysql-bin\.\d{6,}$/.test(file.name)||!/^\d+$/.test(String(file.size)))fail('AUDIT_SOURCE_FILE_INVALID')
 await mkdir(root,{recursive:true,mode:0o700})
 const directory=await mkdtemp(join(root,'raw-'))
 try{
  await runReader(tool,['--defaults-file='+optionsFile,'--no-login-paths','--protocol=TCP','--read-from-remote-server','--raw','--verify-binlog-checksum','--get-server-public-key','--stop-position='+String(preambleOnly?Math.min(256,Number(file.size)):file.size),'--result-file='+directory+'/',file.name],{signal})
  const path=join(directory,file.name),info=await stat(path)
  if(info.size<80||(!preambleOnly&&info.size<Number(file.size)))fail('AUDIT_SOURCE_SIZE_CHANGED')
  // The remote reader may include the first event at the stop position as an
  // active log grows. Bound our private copy to the inventoried byte boundary;
  // the raw event guard and second CRC pass verify that exact snapshot.
  if(!preambleOnly&&info.size>Number(file.size))await truncate(path,Number(file.size))
  const handle=await open(path,'r'),bytes=Buffer.alloc(Math.min(256,info.size,Number(file.size)))
  try{await handle.read(bytes,0,bytes.length,0)}finally{await handle.close()}
  const headerSha256=canonicalBinlogPreamble(bytes)
  return {directory,path,headerSha256,cleanup:()=>rm(directory,{recursive:true,force:true})}
 }catch(error){await rm(directory,{recursive:true,force:true});throw error}
}

export async function scanSourceFile(file,descriptor,signal,{tool,optionsFile,root,readDescriptor}){
 const raw=await downloadRaw({tool,optionsFile,file,root,signal})
 const directory=await mkdtemp(join(root,'verified-')),path=join(directory,'committed.jsonl')
 let handle,schemaVerified=false,phase='schema'
 try{
  if(raw.headerSha256!==file.headerSha256)fail('AUDIT_SOURCE_FILE_CHANGED')
  const guard=createAuditSchemaGuard(descriptor.schema)
  for await(const chunk of createReadStream(raw.path)){if(signal?.aborted)fail('AUDIT_RECOVERY_PAUSED');guard.write(chunk)}
  const ddl=guard.finish().ddl
  schemaVerified=!ddl
  phase='decode'
  handle=await open(path,'wx',0o600);let bytes=0,summary
  await runReader(tool,['--no-defaults','--verify-binlog-checksum','--base64-output=DECODE-ROWS','--force-if-open','-vv','--database='+descriptor.schema,raw.path],{signal,stdout:async stream=>{
   summary=await decodeAuditBinlog(utf8Lines(stream),{descriptor,file:file.name,onCommit:async records=>{
    for(const record of records){record.evidence.sourceFileHeaderSha256=file.headerSha256;const line=JSON.stringify(record)+'\n';bytes+=Buffer.byteLength(line);if(bytes>64*1024*1024)fail('AUDIT_RECOVERY_SPOOL_LIMIT');await handle.write(line)}
   }})
  }})
  summary.ddl ||= ddl
  if(!summary.firstEventAt)fail('AUDIT_SOURCE_EMPTY_OR_INVALID')
  if((await readDescriptor()).schemaFingerprint!==descriptor.schemaFingerprint)fail('AUDIT_SOURCE_SCHEMA_CHANGED')
  await handle.sync();await handle.close();handle=null
  const manifest={version:1,sourceUuid:descriptor.serverUuid,summary,sha256:createHash('sha256').update(await readFile(path)).digest('hex')}
  const receipt=await open(join(directory,'verified.tmp'),'wx',0o600)
  try{await receipt.writeFile(JSON.stringify(manifest));await receipt.sync()}finally{await receipt.close()}
  await rename(join(directory,'verified.tmp'),join(directory,'verified.json'))
  const dir=await open(directory,'r');try{await dir.sync()}finally{await dir.close()}
  return openVerifiedSpool(directory,manifest)
  }catch(error){
  // Decode, spool and capture failures do not invalidate an independently
  // completed raw DDL scan. Confirm the descriptor has not changed before
  // allowing the engine to continue to older files.
  error.sourcePhase=phase
  error.schemaVerified=schemaVerified&&await readDescriptor().then(shape=>shape.schemaFingerprint===descriptor.schemaFingerprint).catch(()=>false)
  await handle?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});throw error
 }
 finally{await raw.cleanup()}
}

export function openVerifiedSpool(directory,manifest){
 const batches=async function*(){
  if(createHash('sha256').update(await readFile(join(directory,'committed.jsonl'))).digest('hex')!==manifest.sha256)fail('AUDIT_RECOVERY_SPOOL_CORRUPT')
  let batch=[],size=0
  for await(const line of utf8Lines(createReadStream(join(directory,'committed.jsonl')))){
   if(!line)continue
   if(Buffer.byteLength(line)>1000000)fail('AUDIT_RECOVERY_RECORD_LIMIT')
   if(batch.length>=100||size+Buffer.byteLength(line)>1000000){yield batch;batch=[];size=0}
   batch.push(JSON.parse(line));size+=Buffer.byteLength(line)
  }
  if(batch.length)yield batch
 }
 return {summary:manifest.summary,batches,cleanup:()=>rm(directory,{recursive:true,force:true})}
}

export async function replayVerifiedSpools(root,sourceUuid,capture){
 await mkdir(root,{recursive:true,mode:0o700})
 for(const name of await readdir(root)){
  // A single DB lease owns this directory; unfinished transfers are disposable.
  if(/^(raw|credentials)-[A-Za-z0-9]+$/.test(name)){await rm(join(root,name),{recursive:true,force:true});continue}
  if(!/^verified-[A-Za-z0-9]+$/.test(name))continue
  const directory=join(root,name),info=await lstat(directory)
  if(!info.isDirectory()||info.isSymbolicLink())continue
  let manifest
  try{manifest=JSON.parse(await readFile(join(directory,'verified.json'),'utf8'))}catch(error){if(error.code==='ENOENT'){await rm(directory,{recursive:true,force:true});continue}throw error}
  if(manifest.summary?.ddl){await rm(directory,{recursive:true,force:true});continue}
  if(manifest.version!==1||manifest.sourceUuid!==sourceUuid)fail('AUDIT_RECOVERY_SPOOL_SOURCE_MISMATCH')
  const spool=openVerifiedSpool(directory,manifest);let count=0
  for await(const records of spool.batches()){
   const result=await capture({version:1,records})
   if(result.applied!==true||result.results?.length!==records.length||result.results.some(row=>row.status!=='captured'))fail('AUDIT_RECOVERY_CAPTURE_UNCONFIRMED')
   count+=records.length
  }
  if(count!==manifest.summary.count)fail('AUDIT_RECOVERY_SPOOL_MISMATCH')
  await spool.cleanup()
 }
}
