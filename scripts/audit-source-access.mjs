// One-time database access preparation, owned by Aurora. This CLI never grants
// itself privileges or reads administrative credentials. Review/apply its SQL
// with the database's existing administration procedure.
import {createRequire} from 'node:module'
import {sourceConfiguration,readSourceInventory} from './audit-recovery-worker.mjs'
const mysql=createRequire(process.env.AUDIT_APP_ENTRY||'/app/.output/server/index.mjs')('mysql2/promise')
const db=await mysql.createConnection(sourceConfiguration())
try{
 if(process.argv.includes('--check')){
  const source=await readSourceInventory(db)
  console.log(JSON.stringify({ready:true,serverUuid:source.serverUuid,files:source.files.length}))
 }else if(process.argv.includes('--print-grant-sql')){
  const [[row]]=await db.query('SELECT CURRENT_USER() AS account')
  const at=row.account.lastIndexOf('@')
  if(at<1)throw Error('AUDIT_SOURCE_ACCOUNT_INVALID')
  const literal=value=>"'"+value.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'"
  console.log('GRANT REPLICATION CLIENT, REPLICATION SLAVE ON *.* TO '+literal(row.account.slice(0,at))+'@'+literal(row.account.slice(at+1))+';')
 }else throw Error('AUDIT_SOURCE_MODE_REQUIRED')
}catch(error){console.error(JSON.stringify({code:error.code||error.message||'AUDIT_SOURCE_CHECK_FAILED'}));process.exitCode=1}
finally{await db.end()}
