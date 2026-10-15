#!/usr/bin/env bash
# Run on casita01 as the same rootless Podman user that owns the application.
# --connect makes one reversible change: attach Aurora to Loki's existing network.
set -euo pipefail
app_container="${AUDIT_APP_CONTAINER:-app-sistema-de-ingresos-2}"
loki_container="${AUDIT_LOKI_CONTAINER:-observability_loki}"
shared_network="${AUDIT_MONITORING_NETWORK:-monitoring_net}"
has_network() {
  podman inspect --format '{{json .NetworkSettings.Networks}}' "$1" |
    python3 -c 'import json,sys;sys.exit(0 if sys.argv[1] in json.load(sys.stdin) else 1)' "$shared_network"
}
podman network exists "$shared_network"
if ! has_network "$loki_container"; then
  echo "BLOCKED: Loki is not attached to the expected monitoring network; verify deployment topology." >&2
  exit 2
fi
if ! has_network "$app_container"; then
  if [[ "${1:-}" != "--connect" ]]; then
    echo "BLOCKED: Aurora and Loki do not share $shared_network. Rerun with --connect to attach Aurora without restarting it." >&2
    exit 2
  fi
  podman network connect "$shared_network" "$app_container"
fi
podman exec -i \
  -e "AUDIT_PROBE_FROM=${AUDIT_PROBE_FROM:-2026-09-29}" \
  -e "AUDIT_PROBE_TO=${AUDIT_PROBE_TO:-2026-09-29}" \
  "$app_container" node --input-type=module <<'AUDIT_PROBE_NODE'
// Read-only source/DB diagnostic. Run INSIDE the deployed Aurora container.
// Prints counts and source hashes only; never cookies, DB credentials, names or raw logs.
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const hash=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,12)
const from=process.env.AUDIT_PROBE_FROM||'2026-09-29'
const to=process.env.AUDIT_PROBE_TO||from
let connection
try {
 const url=new URL(process.env.AUDIT_LOKI_URL||process.env.LOKI_URL||process.env.GRAFANA_LOKI_URL||'http://observability_loki:3100')
 url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/loki\/api\/v1\/(?:push|query|query_range)$/,'')+'/loki/api/v1/query_range'
 const headers={Accept:'application/json'}
 const token=process.env.AUDIT_LOKI_TOKEN||process.env.LOKI_BEARER_TOKEN
 const username=process.env.AUDIT_LOKI_USERNAME||process.env.LOKI_USERNAME
 if(token)headers.Authorization='Bearer '+token
 else if(username)headers.Authorization='Basic '+Buffer.from(username+':'+(process.env.AUDIT_LOKI_PASSWORD||process.env.LOKI_PASSWORD||'')).toString('base64')
 if(process.env.AUDIT_LOKI_TENANT_ID)headers['X-Scope-OrgID']=process.env.AUDIT_LOKI_TENANT_ID
 const selectors=[process.env.AUDIT_LOKI_SELECTOR].filter(Boolean)
 if(!selectors.length)selectors.push(...['container_name','container','service_name'].map(key=>'{'+key+'=~".*husky-pass.*"}'))
 const records=new Map()
 for(const selector of selectors){
  url.search=new URLSearchParams({query:selector+' |= "credentialization.submission.database-committed"',start:String(BigInt(new Date(from+'T00:00:00-06:00').getTime())*1000000n),end:String(BigInt(new Date(to+'T23:59:59.999-06:00').getTime())*1000000n),direction:'BACKWARD',limit:'5000'}).toString()
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw Object.assign(new Error('Historical source rejected query'),{code:'LOKI_HTTP_'+response.status})
  const data=await response.json()
  if(data.status!=='success')throw new Error('Historical source returned invalid response')
  let count=0
  for(const stream of data.data?.result||[])for(const [ns,line] of stream.values||[]){
   count++
   let event;try{event=JSON.parse(line.slice(line.indexOf('{')))}catch{continue}
   if(event.message!=='credentialization.submission.database-committed'||['error','warn','fatal'].includes(event.level))continue
   const evidenceHash=createHash('sha256').update(JSON.stringify({ns,labels:stream.stream,line})).digest('hex')
   records.set(evidenceHash,event)
  }
  if(count>=5000)throw new Error('Result truncated; select a smaller date interval')
 }
 if(!records.size)throw Object.assign(new Error('No real Husky Pass committed records in requested dates'),{code:'NO_HUSKY_HISTORY'})
 const require=createRequire('/app/.output/server/index.mjs')
 const mysql=require('mysql2/promise')
 connection=await mysql.createConnection({host:process.env.CONTROL_ESCOLAR_MYSQL_HOST,port:Number(process.env.CONTROL_ESCOLAR_MYSQL_PORT||3306),user:process.env.CONTROL_ESCOLAR_MYSQL_USER,password:process.env.CONTROL_ESCOLAR_MYSQL_PASSWORD,database:process.env.CONTROL_ESCOLAR_MYSQL_DATABASE,connectTimeout:10000})
 const [rows]=await connection.query('SELECT matricula FROM matricula WHERE matricula IS NOT NULL')
 const known=new Set()
 for(const row of rows){const value=String(row.matricula||'').trim();for(const variant of [value,value.toUpperCase(),value.toLowerCase()])known.add(hash(variant))}
 const resolved=[...records].filter(([,event])=>known.has(String(event.matricula?.hash||'')))
 if(!resolved.length)throw Object.assign(new Error('Source records exist but do not resolve to the student catalog'),{code:'UNRESOLVED_HUSKY_HISTORY'})
 console.log(JSON.stringify({diagnostic:'real-husky-source-and-database',realSourceRecords:records.size,resolvedRecords:resolved.length,from,to,evidenceHashes:resolved.slice(0,3).map(([key])=>key),mergeGate:'PENDING_AUTHENTICATED_API_AND_UI_TEST'},null,2))
}catch(error){console.error(JSON.stringify({diagnostic:'audit-history-runtime',passed:false,code:error.code||error.cause?.code||'PROBE_FAILED',message:error.message,mergeGate:'BLOCKED'}));process.exitCode=1}
finally{await connection?.end()}

AUDIT_PROBE_NODE
