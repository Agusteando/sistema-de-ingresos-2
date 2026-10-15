// Real-data merge gate. No fixtures, local mock servers, synthesized events or injected sessions.
// Run from a host with access to Aurora. Supply an existing signed browser session in a
// private cookie file; never paste credentials into chat or commit them to the repository.
import assert from 'node:assert/strict'
import {readFile,stat,writeFile} from 'node:fs/promises'
import {parseArgs} from 'node:util'
const {values}=parseArgs({options:{from:{type:'string'},to:{type:'string'},'cookie-file':{type:'string'},'evidence-file':{type:'string'}}})
const from=values.from,to=values.to
assert.match(from||'',/^\d{4}-\d{2}-\d{2}$/,'--from is required')
assert.match(to||'',/^\d{4}-\d{2}-\d{2}$/,'--to is required')
const cookiePath=values['cookie-file']||process.env.AUDIT_COOKIE_FILE
assert.ok(cookiePath,'Provide --cookie-file or AUDIT_COOKIE_FILE containing an existing authenticated Aurora Cookie header')
const info=await stat(cookiePath)
if(process.platform!=='win32')assert.equal(info.mode&0o077,0,'Cookie file must be private (chmod 600)')
const cookie=(await readFile(cookiePath,'utf8')).trim().replace(/^Cookie:\s*/i,'')
assert.match(cookie,/(?:^|;\s*)auth_session_token=/,'A real signed Aurora session is required')
const url=new URL('https://aurora.casitaiedis.edu.mx/api/control-escolar/audit/history')
url.search=new URLSearchParams({from,to,plantel:'ALL'}).toString()
const response=await fetch(url,{headers:{Cookie:cookie,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(120000)})
assert.equal(response.status,200,'Authenticated historical API must return HTTP 200')
const result=await response.json()
assert.equal(result.available,true,'Historical source must be available')
assert.equal(Boolean(result.partial),false,'Partial retrieval fails acceptance')
assert.equal(Boolean(result.truncated),false,'Truncated retrieval fails acceptance; use smaller date windows')
const family=result.events?.filter(e=>e.source==='Husky Pass'&&e.quality==='historical')||[]
assert.ok(family.length>0,'No real historical Husky Pass records: merge remains blocked')
for(const item of family){
 assert.match(item.evidenceHash||'',/^[a-f0-9]{64}$/,'Real source evidence hash required')
 assert.match(item.matricula||'',/^[A-Z]{1,6}\d{2,8}$/,'Historical account must resolve to a real matrícula')
 assert.ok(item.date>=from&&item.date<=to,'Result outside requested dates')
 assert.equal(item.before,null,'Never synthesize historical values')
}
const proof={gate:'real-husky-pass-history',passed:true,checkedAt:new Date().toISOString(),origin:url.origin,from,to,huskyPassEvents:family.length,systems:[...new Set(result.events.map(e=>e.source))],evidenceHashes:[...new Set(family.map(e=>e.evidenceHash))],authenticated:true,partial:false,truncated:false}
if(values['evidence-file'])await writeFile(values['evidence-file'],JSON.stringify(proof,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify(proof,null,2))
