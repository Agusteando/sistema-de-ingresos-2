import {affectsAuditTable} from './audit-ddl-target.mjs'
import {createHash} from 'node:crypto'
const fault=code=>Object.assign(new Error(code),{code})
const mexico=utc=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(utc)
 const p=key=>parts.find(part=>part.type===key).value
 return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}`
}
export async function* utf8Lines(stream){
 const decoder=new TextDecoder('utf-8',{fatal:true});let pending=''
 for await(const chunk of stream){
  pending+=decoder.decode(chunk,{stream:true});if(pending.length>4*1024*1024)throw fault('AUDIT_SOURCE_LINE_LIMIT')
  let at;while((at=pending.indexOf('\n'))>=0){yield pending.slice(0,at);pending=pending.slice(at+1)}
 }
 pending+=decoder.decode();if(pending)yield pending
}
// Only the trusted mysqlbinlog process supplies decoded text. The caller must
// verify its exit status/checksums before importing the emitted spool.
export async function decodeAuditBinlog(lines,{descriptor,file,onCommit}){
 const {schema,identityOrdinal,columnCount,fields}=descriptor
 if(!/^[A-Za-z0-9_]+$/.test(schema)||!/^mysql-bin\.\d{6,}$/.test(file)||!Number.isInteger(identityOrdinal)||!Number.isInteger(columnCount)||columnCount<identityOrdinal)throw fault('AUDIT_SOURCE_DESCRIPTOR_INVALID')
 const byOrdinal=new Map(fields.map(field=>[Number(field.ordinal),field.name]))
 if(byOrdinal.has(identityOrdinal)||byOrdinal.has(1)||[...byOrdinal.keys()].some(n=>!Number.isInteger(n)||n<1||n>columnCount))throw fault('AUDIT_SOURCE_DESCRIPTOR_INVALID')
 let lineCount=0
 let position='',header='',gtid='',row=null,side='before',pending=[],count=0,firstEventAt=null,lastCommitAt=null,ddl=false,ddlText='',lastCommitPosition='4'
 const stamp=text=>{
  const m=text.match(/^#(\d{2})(\d{2})(\d{2})\s+(\d{1,2}:\d\d:\d\d)/)
  return m?mexico(new Date(`20${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(8,'0')}Z`)):null
 }
 const flush=()=>{
  if(!row)return
  if(row.schema===schema&&row.table==='matricula'&&row.operation==='UPDATE'){
   if(row.counts.before.size!==columnCount||row.counts.after.size!==columnCount||Array.from({length:columnCount},(_,i)=>i+1).some(n=>!row.counts.before.has(n)||!row.counts.after.has(n)))throw fault('AUDIT_HISTORICAL_ROW_IMAGE_INCOMPLETE')
   const before=row.before,after=row.after,matricula=before.get(identityOrdinal)?.match(/^'([A-Za-z]{1,6}\d{2,8})'$/)?.[1]?.toUpperCase()
   if(matricula&&before.get(identityOrdinal)===after.get(identityOrdinal)&&/^\d+$/.test(before.get(1)||'')&&before.get(1)===after.get(1)){
    const m=row.header.match(/^#\d{6}\s+\d{1,2}:\d\d:\d\d.*end_log_pos\s+(\d+)\s+CRC32\s+0x([a-fA-F0-9]{8})/)
    if(!m||!stamp(row.header))throw fault('AUDIT_SOURCE_EVENT_ANCHOR_MISSING')
    for(const [ordinal,field]of byOrdinal)if(before.has(ordinal)&&after.has(ordinal)&&before.get(ordinal)!==after.get(ordinal)){
     const record={version:1,matricula,field,rowId:before.get(1),recordedAt:stamp(row.header),beforeSql:before.get(ordinal),afterSql:after.get(ordinal),evidence:{kind:'mysql-binlog',schema,table:'matricula',file,position:row.position,endPosition:m[1],crc32:m[2].toLowerCase(),decodedRowSha256:row.hash,fullImages:true,identityOrdinal,fieldOrdinal:ordinal,mysqlVersion:descriptor.version,gtid:row.gtid,sourceServerUuid:descriptor.serverUuid,schemaFingerprint:descriptor.schemaFingerprint}}
     pending.push(record);if(pending.length>100000)throw fault('AUDIT_SOURCE_TRANSACTION_LIMIT')
    }
   }
  }
  row=null
 }
 for await(const line of lines){
  if(++lineCount%5000===0)await new Promise(resolve=>setImmediate(resolve))
  if(line.startsWith('# at ')){if(row)row.hash=row.digest.digest('hex');flush();position=line.slice(5).trim()}
  if(/^#\d{6}\s/.test(line)){header=line;firstEventAt||=stamp(line)}
  if(line.includes('GTID_NEXT='))gtid=line.trim()
  if(!line.startsWith('#')){
   if(/^\s*(ALTER|CREATE|DROP|RENAME|TRUNCATE)\b/i.test(line))ddlText=line
   else if(ddlText)ddlText+=' '+line
   if(ddlText.length>64000)throw fault('AUDIT_SOURCE_DDL_LIMIT')
   if(line.includes('/*!*/;')&&ddlText){ddl ||= affectsAuditTable(ddlText,schema,schema);ddlText=''}
  }
  const match=line.match(/^### (UPDATE|INSERT INTO|DELETE FROM) `([^`]+)`\.`([^`]+)`/)
  if(match){
   if(row)row.hash=row.digest.digest('hex');flush();side=match[1]==='INSERT INTO'?'after':'before'
   row={schema:match[2],table:match[3],operation:match[1],position,header,gtid,before:new Map(),after:new Map(),counts:{before:new Set(),after:new Set()},digest:createHash('sha256')}
  }else if(line.startsWith('### WHERE'))side='before'
  else if(line.startsWith('### SET'))side='after'
  if(row&&line.startsWith('###')){
   row.digest.update(line+'\n')
   const col=line.match(/^###\s+@(\d+)=(.*)/)
   if(col){const ordinal=Number(col[1]);row.counts[side].add(ordinal);if(ordinal===1||ordinal===identityOrdinal||byOrdinal.has(ordinal))row[side].set(ordinal,col[2].match(/^('(?:[^'\\]|\\[\s\S]|'')*'|NULL|-?\d+(?:\.\d+)?)(?:\s+\/\*[\s\S]*\*\/)?$/)?.[1]||col[2])}
  }
  if(line.startsWith('COMMIT')){
   if(row)row.hash=row.digest.digest('hex');flush()
   const commit=header.match(/end_log_pos\s+(\d+).*Xid\s*=\s*(\d+)/)
   if(pending.length&&!commit)throw fault('AUDIT_SOURCE_COMMIT_MISSING')
   if(commit){
    for(const item of pending)Object.assign(item.evidence,{commitPosition:commit[1],xid:commit[2],committed:true,checksumVerified:true})
    if(pending.length)await onCommit(pending)
    count+=pending.length;pending=[];lastCommitPosition=commit[1];lastCommitAt=stamp(header)
   }
  }
  if(line.startsWith('ROLLBACK')&&!line.includes('added by mysqlbinlog')){if(row)row.hash=row.digest.digest('hex');flush();pending=[]}
 }
 if(row)row.hash=row.digest.digest('hex');flush()
 if(pending.length)throw fault('AUDIT_SOURCE_UNCOMMITTED_TAIL')
 return {count,firstEventAt,lastCommitAt,lastCommitPosition,ddl}
}
