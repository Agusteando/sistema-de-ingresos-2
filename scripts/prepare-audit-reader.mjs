// Build-only, pinned upstream binary. Never installs/runs a MySQL server.
import {mkdtemp,writeFile,mkdir,copyFile,chmod,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const exec=promisify(execFile)
export const prepareAuditReader=async(destination='/opt/audit-reader')=>{
 if(process.arch!=='x64')throw Error('AUDIT_READER_ARCH_UNSUPPORTED')
 const temp=await mkdtemp(join(tmpdir(),'mm-reader-build-'))
 try{
  const response=await fetch('https://repo.mysql.com/apt/ubuntu/pool/mysql-8.4-lts/m/mysql-community/mysql-community-server-core_8.4.11-1ubuntu24.04_amd64.deb',{signal:AbortSignal.timeout(90000)})
  if(!response.ok)throw Error('AUDIT_READER_DOWNLOAD_FAILED')
  let size=0;const parts=[]
  for await(const part of response.body){size+=part.length;if(size>50000000)throw Error('AUDIT_READER_DOWNLOAD_LIMIT');parts.push(part)}
  const data=Buffer.concat(parts)
  if(createHash('sha256').update(data).digest('hex')!=='dafb704d3e602980ef6dcadfbd9ca8b8660736cdbfbcbd1cdd5c0638ab097cfd')throw Error('AUDIT_READER_PACKAGE_CHECKSUM_MISMATCH')
  const pkg=join(temp,'reader.deb');await writeFile(pkg,data,{mode:0o600})
  await exec('dpkg-deb',['-x',pkg,join(temp,'tool')])
  await mkdir(destination,{recursive:true});await copyFile(join(temp,'tool/usr/bin/mysqlbinlog'),join(destination,'mysqlbinlog'));await chmod(join(destination,'mysqlbinlog'),0o755)
  const version=await exec(join(destination,'mysqlbinlog'),['--no-defaults','--version'])
  if(!version.stdout.includes('8.4.11'))throw Error('AUDIT_READER_VERSION_INVALID')
 }finally{await rm(temp,{recursive:true,force:true})}
}
if(process.argv[1]?.endsWith('/prepare-audit-reader.mjs'))await prepareAuditReader(process.argv[2]||'/opt/audit-reader')
