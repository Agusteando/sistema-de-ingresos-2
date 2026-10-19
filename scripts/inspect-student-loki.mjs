// Read-only. Pipe into the deployed Aurora container; no infrastructure changes.
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
export const identityTokens=matricula=>[matricula,...new Set([matricula,matricula.toLowerCase()].map(value=>createHash('sha256').update(value).digest('hex').slice(0,12)))]
export const redactEvidence=line=>String(line)
  .replace(/https?:\/\/[^\s'"<>]+/gi,'[URL]')
  .replace(/((?:password|passwd|authorization|cookie|token|secret|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^,}\s]+)/gi,'$1"[Redactado]"')
export const contextSelector=labels=>{
  const identity=['container','container_name','service_name'].find(key=>labels[key])
  if(!identity)throw Error('Missing stable stream identity')
  const keys=[identity,...(labels.node?['node']:[])]
  return '{'+keys.map(key=>key+'='+JSON.stringify(String(labels[key]))).join(',')+'}'
}
export async function inspectStudentLoki({matricula,from,to,endpoint,headers={},fetcher=fetch}){
  if(!/^[A-Z]{1,6}\d{2,8}$/.test(matricula))throw Error('Invalid matrícula')
  const start=Date.parse(from+'T00:00:00-06:00'),end=Date.parse(to+'T23:59:59.999-06:00')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(start)||!Number.isFinite(end)||new Date(from+'T12:00:00Z').toISOString().slice(0,10)!==from||new Date(to+'T12:00:00Z').toISOString().slice(0,10)!==to||end<start||end-start>31*86400000)throw Error('Select at most 31 days')
  const base=new URL(endpoint)
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Invalid Loki URL')
  base.pathname=base.pathname.replace(/\/+$/,'').replace(/\/loki\/api\/v1\/(?:push|query|query_range)$/,'')+'/loki/api/v1/query_range'
  const evidence=new Map(),contexts=new Map(),failures=[]
  const collect=async(query,a,b,kind)=>{
    const url=new URL(base);url.search=new URLSearchParams({query,start:String(BigInt(a)*1000000n),end:String(BigInt(b)*1000000n),limit:'1500',direction:'FORWARD'})
    const response=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)})
    if(!response.ok)throw Error('Loki HTTP '+response.status)
    const body=await response.json();if(body.status!=='success'||!Array.isArray(body.data?.result))throw Error('Invalid Loki response')
    let count=0
    for(const stream of body.data.result)for(const [ns,line] of stream.values||[]){
      count++
      const hash=createHash('sha256').update(JSON.stringify({ns,labels:stream.stream,line})).digest('hex')
      const old=evidence.get(hash)
      evidence.set(hash,{ns,kind:old?.kind==='identity'?'identity':kind,evidenceHash:hash,stream:stream.stream,line:redactEvidence(line)})
      if(kind==='identity'){
        const time=Number(BigInt(ns)/1000000n),second=Math.floor(time/1000)
        contexts.set(JSON.stringify(stream.stream)+'|'+second,{labels:stream.stream,time})
      }
    }
    if(count>=1500)failures.push({kind,reason:'Result limit reached; narrow the dates'})
  }
  // No action-name filter: inspect all student-matching logs, including unknown emitters.
  for(const label of ['container_name','container','service_name']){
    const query='{'+label+'=~".*(husky-pass|aurora|sistema-de-ingresos).*"} |~ '+JSON.stringify('(?i)'+identityTokens(matricula).join('|'))
    try{await collect(query,start,end,'identity')}catch(error){failures.push({label,reason:error.message})}
  }
  // Console objects were sometimes split over multiple log lines. Recover neighboring
  // lines from the exact stream instead of discarding them with an action-name filter.
  const windows=[...contexts.values()]
  if(windows.length>40)failures.push({kind:'context',reason:'More than 40 contexts; narrow the dates'})
  for(const {labels,time} of windows.slice(0,40)){
    const selector=contextSelector(labels)
    try{await collect(selector,Math.max(start,time-2000),Math.min(end,time+2000),'context')}catch(error){failures.push({kind:'context',reason:error.message})}
  }
  return {matricula,from,to,complete:failures.length===0,failures,records:[...evidence.values()].sort((a,b)=>BigInt(a.ns)<BigInt(b.ns)?-1:BigInt(a.ns)>BigInt(b.ns)?1:0)}
}
const main=async()=>{
 const env=process.env,headers={Accept:'application/json'}
 const token=env.AUDIT_LOKI_TOKEN||env.LOKI_BEARER_TOKEN,user=env.AUDIT_LOKI_USERNAME||env.LOKI_USERNAME
 if(token)headers.Authorization='Bearer '+token
 else if(user)headers.Authorization='Basic '+Buffer.from(user+':'+(env.AUDIT_LOKI_PASSWORD||env.LOKI_PASSWORD||'')).toString('base64')
 if(env.AUDIT_LOKI_TENANT_ID)headers['X-Scope-OrgID']=env.AUDIT_LOKI_TENANT_ID
 const result=await inspectStudentLoki({matricula:env.AUDIT_MATRICULA||'',from:env.AUDIT_FROM||'',to:env.AUDIT_TO||'',endpoint:env.AUDIT_LOKI_URL||env.LOKI_URL||env.GRAFANA_LOKI_URL||'http://observability_loki:3100',headers})
 console.log(JSON.stringify(result,null,2));if(!result.complete)process.exitCode=2
}
if(!process.argv[1]||import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({complete:false,error:error.message}));process.exitCode=1})
