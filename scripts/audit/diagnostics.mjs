// Read-only operational evidence. Never prints credentials or student values.
export async function diagnoseRecovery(db,readInventory){
 const [statusRows]=await db.query("SELECT payload FROM control_escolar_audit_events WHERE event_type='audit_recovery_status' AND source_flow='audit_recovery_service' ORDER BY id DESC LIMIT 1")
 const raw=statusRows[0]?.payload
 const status=typeof raw==='string'?JSON.parse(raw):raw||{}
 const [inbox]=await db.query("SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.state')),'pending') AS state,JSON_UNQUOTE(JSON_EXTRACT(payload,'$.lastError')) AS code,COUNT(*) AS count FROM control_escolar_audit_events WHERE event_type='audit_recovery_pending' AND source_flow='audit_recovery_service' GROUP BY state,code")
 let source
 try{const inventory=await readInventory();source={ready:true,version:inventory.version,files:inventory.files.length}}
 catch(error){source={ready:false,code:String(error.code||'AUDIT_SOURCE_CHECK_FAILED')}}
 return {source,recovery:{state:status.state||'not-started',code:status.code||'',updatedAt:status.updatedAt||null,pendingRecords:inbox.reduce((total,row)=>total+(row.state==='applied'?0:Number(row.count||0)),0),completeFiles:Number(status.completeFiles||0),files:Number(source.ready?source.files:status.files||0),phase:String(status.phase||''),currentFile:String(status.currentFile||'')},inbox}
}
