// Small synthetic MySQL v4 row log for executable reader/CRC regression tests.
export function makeAuditBinlog({ddl=null}={}){
 const timestamp=1792007993,parts=[Buffer.from([254,98,105,110])];let position=4
 const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
 const event=(type,payload)=>{
  const size=19+payload.length+4,header=Buffer.alloc(19);header.writeUInt32LE(timestamp,0);header[4]=type;header.writeUInt32LE(1,5);header.writeUInt32LE(size,9);header.writeUInt32LE(position+size,13)
  const data=Buffer.concat([header,payload]),checksum=Buffer.alloc(4);checksum.writeUInt32LE(crc32(data));parts.push(Buffer.concat([data,checksum]));position+=size
 }
 const fde=Buffer.alloc(2+50+4+1+41+1);fde.writeUInt16LE(4);fde.write('8.4.11',2);fde.writeUInt32LE(timestamp,52);fde[56]=19;fde[57+18]=8;for(const code of [29,30,31])fde[57+code]=10;fde[fde.length-1]=1;event(15,fde)
 if(ddl){const db=Buffer.from(ddl.database),sql=Buffer.from(ddl.sql),header=Buffer.alloc(13);header[8]=db.length;event(2,Buffer.concat([header,db,Buffer.from([0]),sql]))}
 const id=Buffer.from([2,0,0,0,0,0]),schema=Buffer.from('central'),table=Buffer.from('matricula')
 event(19,Buffer.concat([id,Buffer.from([0,0,schema.length]),schema,Buffer.from([0,table.length]),table,Buffer.from([0,3,3,15,15,4,255,0,255,0,0])]))
 const row=value=>{const identity=Buffer.from('TX9876'),group=Buffer.from(value),primary=Buffer.alloc(4);primary.writeUInt32LE(42);return Buffer.concat([Buffer.from([0]),primary,Buffer.from([identity.length]),identity,Buffer.from([group.length]),group])}
 event(31,Buffer.concat([id,Buffer.from([1,0,2,0,3,7,7]),row('ANTÁRTIDA'),row('AMÉRICA')]))
 const xid=Buffer.alloc(8);xid.writeBigUInt64LE(50484068n);event(16,xid)
 return Buffer.concat(parts)
}
