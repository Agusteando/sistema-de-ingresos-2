// Shared by the API and operator-only importer. Never infers missing values.
export const canonicalRecoveryField=value=>{
 const field=String(value||'').replace(/[_\s-]/g,'').toLowerCase()
 return ({group:'grupo',nombre:'nombres',status:'estatus'})[field]||field
}
export const parseAuditPayload=value=>{
 try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}
}
export const recoveryError=(code,message)=>Object.assign(new Error(message),{code})
export const parseBinlogLiteral=value=>{
 if(typeof value!=='string')throw recoveryError('INVALID_BINLOG_LITERAL','SQL literal required')
 if(value==='NULL')return null
 if(/^-?\d+(?:\.\d+)?$/.test(value))return value
 if(!/^'(?:[^'\\]|\\[\s\S]|'')*'$/.test(value))throw recoveryError('INVALID_BINLOG_LITERAL','Unsupported SQL literal')
 const escapes={'0':'\0',n:'\n',r:'\r',t:'\t',b:'\b',Z:'\x1a',"'":"'",'"':'"','\\':'\\'}
 return value.slice(1,-1).replace(/''|\\([\s\S])/g,(match,key)=>{
  if(match==="''")return "'"
  if(!Object.prototype.hasOwnProperty.call(escapes,key))throw recoveryError('INVALID_BINLOG_ESCAPE','Unsupported SQL escape')
  return escapes[key]
 })
}
export const safeRecoveredValue=(field,value)=>{
 if(value===null)return null
 const text=String(value)
 return /foto|photo|adjunt|ine|curp|password|token|secret/i.test(field)?(text?'[Registrado]':null):text.slice(0,500)
}
export const validateBinlogRecovery=input=>{
 const fail=message=>{throw recoveryError('INVALID_RECOVERY_EVIDENCE',message)}
 if(!input||input.version!==1||!/^[A-Z]{1,6}\d{2,8}$/.test(input.matricula||''))fail('Invalid recovery identity')
 if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,89}$/.test(input.field||''))fail('Invalid field')
 if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input.recordedAt||'')||!Number.isFinite(Date.parse(input.recordedAt.replace(' ','T')+'-06:00')))fail('Exact source event second required')
 if(!/^\d+$/.test(input.rowId||''))fail('Source primary key required')
 const evidence=input.evidence||{}
 if(evidence.kind!=='mysql-binlog'||!/^mysql-bin\.\d{6,}$/.test(evidence.file||'')||!/^[a-zA-Z0-9_]+$/.test(evidence.schema||'')||evidence.table!=='matricula')fail('Invalid source')
 for(const key of ['position','endPosition','commitPosition','xid'])if(!/^\d+$/.test(evidence[key]||''))fail('Missing source '+key)
 if(BigInt(evidence.position)<BigInt(4)||BigInt(evidence.endPosition)<=BigInt(evidence.position)||BigInt(evidence.commitPosition)<=BigInt(evidence.endPosition))fail('Invalid event/commit positions')
 if(!/^[a-f0-9]{8}$/i.test(evidence.crc32||'')||!/^[a-f0-9]{64}$/i.test(evidence.decodedRowSha256||''))fail('Missing source checksums')
 if(evidence.committed!==true||evidence.fullImages!==true||evidence.checksumVerified!==true)fail('Committed, checked full row images required')
 if(!Number.isInteger(evidence.identityOrdinal)||evidence.identityOrdinal<1||!Number.isInteger(evidence.fieldOrdinal)||evidence.fieldOrdinal<1||evidence.identityOrdinal===evidence.fieldOrdinal)fail('Invalid source column map')
 if(evidence.sourceServerUuid!==undefined&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(evidence.sourceServerUuid)||!/^[a-f0-9]{64}$/i.test(evidence.sourceFileHeaderSha256||'')))fail('Invalid source server/file identity')
 const before=parseBinlogLiteral(input.beforeSql),after=parseBinlogLiteral(input.afterSql)
 if(before===after)fail('No field change in source')
 return {version:1,matricula:input.matricula,field:input.field,recordedAt:input.recordedAt,rowId:input.rowId,
  before:safeRecoveredValue(input.field,before),after:safeRecoveredValue(input.field,after),evidence:{...evidence}}
}
export const recoverySourceKey=item=>JSON.stringify([item.evidence.schema,item.evidence.table,item.evidence.file,item.evidence.position,item.rowId,canonicalRecoveryField(item.field),...(item.evidence.sourceServerUuid?[item.evidence.sourceServerUuid,item.evidence.sourceFileHeaderSha256||'']:[])])
export const auditRowFields=row=>{
 const payload=parseAuditPayload(row.payload)
 return Array.isArray(payload.changes)?payload.changes.map(change=>change.field):Array.isArray(payload.fields)?payload.fields:[]
}
export const recoveryMatchesRow=(item,row)=>String(row.matricula||'').toUpperCase()===item.matricula&&String(row.recorded_at||'').slice(0,19)===item.recordedAt&&auditRowFields(row).some(field=>canonicalRecoveryField(field)===canonicalRecoveryField(item.field))
export const selectRecoveryTarget=(item,rows)=>{
 const matches=rows.filter(row=>row.event_type==='student_update'&&recoveryMatchesRow(item,row))
 const detailed=matches.filter(row=>Array.isArray(parseAuditPayload(row.payload).changes))
 const exact=detailed.filter(row=>parseAuditPayload(row.payload).changes.some(change=>canonicalRecoveryField(change.field)===canonicalRecoveryField(item.field)&&change.before===item.before&&change.after===item.after))
 if(exact.length===1)return {kind:'already-verified',row:exact[0]}
 if(detailed.length)return {kind:'conflict',candidates:matches.map(row=>String(row.id))}
 return matches.length===1?{kind:'linked',row:matches[0]}:{kind:matches.length?'ambiguous':'unattributed',candidates:matches.map(row=>String(row.id))}
}
export const indexAuditRecoveries=(originals,recoveries)=>{
 const rows=new Map(originals.map(row=>[String(row.id),row])),index=new Map()
 for(const stored of recoveries){
  if(stored.event_type!=='student_update_recovery')continue
  const payload=parseAuditPayload(stored.payload),item=validateBinlogRecovery(payload.sourceRecord)
  const original=rows.get(String(payload.originalEventId))
  if(!original)continue
  if(stored.matricula!==original.matricula||stored.plantel!==original.plantel||!recoveryMatchesRow(item,original))throw recoveryError('AUDIT_RECOVERY_LINK_CONFLICT','Recovery does not match original record')
  const originalChanges=parseAuditPayload(original.payload).changes
  if(Array.isArray(originalChanges)&&!originalChanges.some(change=>canonicalRecoveryField(change.field)===canonicalRecoveryField(item.field)&&change.before===item.before&&change.after===item.after))throw recoveryError('AUDIT_RECOVERY_VALUE_CONFLICT','Recovery conflicts with verified original')
  const key=String(original.id)+'|'+canonicalRecoveryField(item.field),previous=index.get(key)
  if(previous&&(previous.before!==item.before||previous.after!==item.after))throw recoveryError('AUDIT_RECOVERY_VALUE_CONFLICT','Conflicting recovery evidence')
  index.set(key,{...item,recoveryEventId:String(stored.id),originalEventId:String(original.id),fingerprint:payload.fingerprint})
 }
 return index
}
