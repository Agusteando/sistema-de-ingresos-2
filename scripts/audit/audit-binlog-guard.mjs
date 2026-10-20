// Inspect Query events before mysqlbinlog's database filter. A qualified DDL
// statement may target the student schema while its default database differs.
// Row payloads are skipped without buffering or decoding unrelated databases.
export function createAuditSchemaGuard(schema){
 if(!/^[A-Za-z0-9_]+$/.test(schema))throw Error('AUDIT_SOURCE_SCHEMA_INVALID')
 let buffer=Buffer.alloc(0),magic=false,event=null,ddl=false
 const consumeQuery=raw=>{
  if(raw.length<17)throw Error('AUDIT_SOURCE_QUERY_INVALID')
  const dbLength=raw[8],statusLength=raw.readUInt16LE(11),at=13+statusLength
  if(at+dbLength+1>raw.length-4)throw Error('AUDIT_SOURCE_QUERY_INVALID')
  const database=raw.subarray(at,at+dbLength).toString('latin1'),sql=raw.subarray(at+dbLength+1,raw.length-4).toString('latin1').replace(/`/g,'').replace(/\/\*!\d*\s*/g,' ')
  const relevant=database===schema||new RegExp('\\b'+schema+'\\s*\\.\\s*matricula\\b','i').test(sql)
  if(relevant&&/\b(?:ALTER|CREATE|DROP|RENAME|TRUNCATE)\b/i.test(sql)&&/\bmatricula\b/i.test(sql))ddl=true
 }
 return {write(chunk){
  buffer=Buffer.concat([buffer,chunk])
  if(!magic){if(buffer.length<4)return;if(!buffer.subarray(0,4).equals(Buffer.from([254,98,105,110])))throw Error('AUDIT_SOURCE_MAGIC_INVALID');buffer=buffer.subarray(4);magic=true}
  while(buffer.length){
   if(!event){
    if(buffer.length<19)return
    const size=buffer.readUInt32LE(9)
    if(size<23||size>1024*1024*1024)throw Error('AUDIT_SOURCE_EVENT_SIZE_INVALID')
    const query=buffer[4]===2
    if(query&&size>4*1024*1024)throw Error('AUDIT_SOURCE_QUERY_LIMIT')
    event={remaining:size-19,query,parts:[]};buffer=buffer.subarray(19)
   }
   const size=Math.min(event.remaining,buffer.length)
   if(event.query)event.parts.push(Buffer.from(buffer.subarray(0,size)))
   buffer=buffer.subarray(size);event.remaining-=size
   if(event.remaining===0){if(event.query)consumeQuery(Buffer.concat(event.parts));event=null}
  }
 },finish(){if(!magic||buffer.length||event)throw Error('AUDIT_SOURCE_TRUNCATED_EVENT');return {ddl}}}
}
