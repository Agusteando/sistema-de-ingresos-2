import { createHash } from 'node:crypto'
import { controlEscolarCentralQuery } from './control-escolar-central'

export type LoggedChange={field:string;before:string|null;after:string|null}
export type LokiRecord = { changes?:LoggedChange[]; auditEventId?:number; at: string; message: string; userId?: unknown; matricula?: unknown; actor?: string; actorEmail?: string; fields?: string[]; source: 'Aurora' | 'Husky Pass'; requestId?: string; rawHash: string }
export type HistoricalStudentAction = {
  id: string; eventId: number; date: string; recordedAt: string; matricula: string
  student: string; field: string; fieldLabel: string; category: string
  before: string|null; after: string|null; source: 'Aurora' | 'Husky Pass'
  actor: string; actorEmail: string; avatar: string; flow: string
  quality: 'historical'|'verified'; plantel: string; ciclo: string
  relatedEventId?: number; evidenceHash: string
}

const hash12 = (value: unknown) => createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 12)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const compact = (value: unknown) => String(value || '').trim()
const allCampuses = (matricula: string) => {
  const code = matricula.toUpperCase().match(/^[A-Z]+/)?.[0] || ''
  return code === 'PMA' || code === 'PMB' ? 'PM' : code
}
const safeDate = (epochNs: string) => {
  try {
    const date = new Date(Number(BigInt(epochNs) / 1000000n))
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date)
    const get = (type: string) => parts.find(part => part.type === type)?.value || ''
    return get('year') + '-' + get('month') + '-' + get('day') + ' ' + get('hour') + ':' + get('minute') + ':' + get('second') + '.' + String(BigInt(epochNs) % 1000000000n).padStart(9, '0')
  } catch { return '' }
}
const getHash = (item: any) => {
  if (item && typeof item === 'object') return String(item.hash || item.redacted?.hash || '')
  return String(item || '')
}
const loggedValue=(value:unknown,field:string):string|null|undefined=>{
  if(value===null)return null
  if(!['string','number','boolean'].includes(typeof value))return undefined
  const text=String(value).trim().slice(0,500)
  return /foto|adjunt|ine|curp|password|token/i.test(field)?(text?'[Registrado]':null):text
}
export const extractLoggedChanges=(obj:any):LoggedChange[]=>{
  const input=Array.isArray(obj?.changes)?obj.changes:[]
  const result:LoggedChange[]=[]
  for(const item of input){
    if(!item||typeof item!=='object'||!Object.prototype.hasOwnProperty.call(item,'before')||!Object.prototype.hasOwnProperty.call(item,'after'))continue
    const field=String(item.field||'')
    if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,89}$/.test(field))continue
    const before=loggedValue(item.before,field),after=loggedValue(item.after,field)
    if(before===undefined||after===undefined)continue
    result.push({field,before,after})
  }
  return result
}
export const parseMessage = (line: string, ns: string, labels: Record<string, string>): LokiRecord | null => {
  let obj: any = {}
  const jsonAt = line.indexOf('{')
  if (jsonAt >= 0) {
    try { obj = JSON.parse(line.slice(jsonAt)) } catch { /* preserve original line */ }
  }
  for(let depth=0;depth<2;depth++){
    const nested=typeof obj.log==='string'?obj.log:typeof obj.message==='string'?obj.message:''
    if(!nested.trim().startsWith('{'))break
    try{const parsed=JSON.parse(nested);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')break;obj={...obj,...parsed};delete obj.log}catch{break}
  }
  const message = compact(obj.message || line)
  // Failed attempts must never be counted as successful writes in a forensic view.
  if (['error','warn','fatal'].includes(compact(obj.level).toLowerCase())) return null
  const husky = message.includes('credentialization.submission.database-committed')
    || message.includes('personas-autorizadas.student.save')
  const aurora = message.includes('centralized matricula overlay updated')
    || message.includes('matricula audited write')
  if (!husky && !aurora) return null
  const source = husky ? 'Husky Pass' : 'Aurora'
  const actorEmail = [obj.actorEmail, obj.actor?.email, obj.user?.email, obj.actor, obj.user,
    line.match(/\b(?:actorEmail|actor|user|email):\s*['"]([^'"]+@[^'"]+)['"]/)?.[1]]
    .find(value => typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value.trim()))?.trim() || ''
  const matricula = obj.matricula || line.match(/\bmatricula:\s*['"]([A-Z]+\d+)['"]/)?.[1]
  const changes=extractLoggedChanges(obj)
  const fields = changes.length?changes.map(change=>change.field):Array.isArray(obj.fields) ? obj.fields.map(String) : Array.isArray(obj.changedFields) ? obj.changedFields.map(String)
    : Array.from(line.matchAll(/['"]((?:grupo|grado|nivel|ciclo|nombres|apellidoPaterno|apellidoMaterno|lugarTrabajoPadre|lugarTrabajoMadre|emailPadre|emailMadre|telefonoPadre|telefonoMadre))['"]/g)).map(match => match[1])
  return {
    at: safeDate(ns), message,
    auditEventId: Number(obj.auditEventId || line.match(/\bauditEventId:\s*(\d+)/)?.[1]) || undefined,
    userId: obj.userId, matricula, fields, changes,
    source, actor: compact(obj.actorName || obj.userName || obj.actor?.name || actorEmail), actorEmail,
    requestId: compact(obj.requestId),
    rawHash: digest(JSON.stringify({ns, labels, line}))
  }
}
// Decode console objects without evaluating source text. Ambiguous/interleaved
// blocks are deliberately excluded rather than attributed by nearby timestamps.
export const parseConsoleBlock=(lines:string[],ns:string,labels:Record<string,string>):LokiRecord|null=>{
  if(lines.length>100||lines.join('\n').length>32000)return null
  const text=lines.join('\n'),start=text.indexOf('{')
  if(start<0||!text.trimEnd().endsWith('}')||lines.filter(line=>/centralized matricula overlay updated|matricula audited write|credentialization.submission.database-committed|personas-autorizadas.student.save/.test(line)).length!==1)return null
  try{
    const raw=text.slice(start)
    const tokens=raw.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*|[^\s]/g)||[]
    const converted=tokens.filter((token,i)=>!(token===','&&['}',']'].includes(tokens[i+1]))).map((token,i,filtered)=>{
      if(token.startsWith("'")){
        const value=token.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\')
        if(/\\/.test(value))throw Error('Unsupported console escape')
        return JSON.stringify(value)
      }
      return /^[A-Za-z_$][\w$]*$/.test(token)&&filtered[i+1]===':'?JSON.stringify(token):token
    }).join('')
    if((converted.match(/"matricula":/g)||[]).length!==1)return null
    const obj=JSON.parse(converted)
    obj.message=text.slice(0,start).trim()
    return parseMessage(JSON.stringify(obj),ns,labels)
  }catch{return null}
}
const parseSelections = (value: string) => {
  const s = compact(value)
  if (!s) return [
    '{container_name=~".*(husky-pass|aurora|sistema-de-ingresos).*"}',
    '{container=~".*(husky-pass|aurora|sistema-de-ingresos).*"}',
    '{service_name=~".*(husky-pass|aurora|sistema-de-ingresos).*"}'
  ]
  // The selector must come from server configuration, never a browser-supplied expression.
  return s.startsWith('{') && s.includes('}') ? [s] : []
}
export const allowedLokiUrl = () => {
  const raw = compact(process.env.AUDIT_LOKI_URL || process.env.LOKI_URL || process.env.GRAFANA_LOKI_URL || 'http://observability_loki:3100')
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid audit history endpoint')
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/loki\/api\/v1\/(?:push|query|query_range)$/, '') + '/loki/api/v1/query_range'
  url.search = ''
  return url
}
type CaptureResult = { records: LokiRecord[]; available: boolean; truncated: boolean; partial: boolean }
export const queryLoki = async (from: Date, to: Date, identityTokens: string[] = []): Promise<CaptureResult> => {
  const url = allowedLokiUrl()
  const selectors = parseSelections(process.env.AUDIT_LOKI_SELECTOR || '')
  const token = compact(process.env.AUDIT_LOKI_TOKEN || process.env.LOKI_BEARER_TOKEN)
  const username = compact(process.env.AUDIT_LOKI_USERNAME || process.env.LOKI_USERNAME)
  const password = compact(process.env.AUDIT_LOKI_PASSWORD || process.env.LOKI_PASSWORD)
  const headers: Record<string,string> = { Accept: 'application/json' }
  const tenant=compact(process.env.AUDIT_LOKI_TENANT_ID)
  if(tenant)headers['X-Scope-OrgID']=tenant
  if (token) headers.Authorization = 'Bearer ' + token
  else if (username) headers.Authorization = 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
  const filter = ' |~ "credentialization.submission.database-committed|centralized matricula overlay updated|matricula audited write|personas-autorizadas.student.save"'
  const startNs = BigInt(from.getTime()) * 1000000n
  const endNs = BigInt(to.getTime()) * 1000000n
  let lastError: unknown = null
  let anySuccess = false
  const records: LokiRecord[] = []
  const seen = new Set<string>()
  let anyTruncated = false
  let failed = 0
  const contexts=new Map<string,{labels:Record<string,string>;ns:string}>()
  for (const selector of selectors) {
    let ceiling = endNs
    let truncated = false
    try {
      for (let page = 0; page < 8 && ceiling >= startNs; page++) {
        url.searchParams.set('query', selector + (identityTokens.length?' |~ '+JSON.stringify('(?i)'+identityTokens.join('|')):filter))
        url.searchParams.set('start', String(startNs))
        url.searchParams.set('end', String(ceiling))
        url.searchParams.set('direction', 'BACKWARD')
        url.searchParams.set('limit', '1500')
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(7500) })
        if (!response.ok) throw new Error('History backend status ' + response.status)
        const payload: any = await response.json()
        if (payload.status !== 'success' || !Array.isArray(payload.data?.result)) throw new Error('History backend returned invalid response')
        anySuccess = true
        let count = 0
        let oldest: bigint | null = null
        for (const stream of payload.data.result) {
          for (const pair of stream.values || []) {
            const ns = BigInt(String(pair[0]))
            if (oldest === null || ns < oldest) oldest = ns
            const entry = parseMessage(String(pair[1]), String(pair[0]), stream.stream || {})
            count++
            const labels=stream.stream||{}
            const identity=['container','container_name','service_name'].find(key=>labels[key])
            if(identity&&(!entry||!entry.matricula)){
              const stable={ [identity]:labels[identity],...(labels.node?{node:labels.node}:{}) }
              contexts.set(JSON.stringify(stable)+'|'+String(ns/1000000000n),{labels:stable,ns:String(ns)})
            }
            if (!entry || !entry.matricula || seen.has(entry.rawHash)) continue
            seen.add(entry.rawHash)
            records.push(entry)
          }
        }
        if (count < 1500 || oldest === null || oldest <= startNs) break
        if (page === 7) truncated = true
        ceiling = oldest - 1n
      }
      anyTruncated ||= truncated
      // A valid empty result may be because this selector doesn't exist in this cluster.
      lastError = null
    } catch (error) {
      lastError = error
      failed++
      console.warn('[historical-student-audit] source query failed', { selector, endpoint:url.host, code:String((error as any)?.cause?.code||(error as any)?.code||''), message: String((error as Error)?.message || error) })
      // Other label families may still contain reachable streams; preserve partial results.
    }
  }
  if(contexts.size>40)anyTruncated=true
  for(const context of [...contexts.values()].slice(0,40)){
    try{
      const request=new URL(url),anchor=BigInt(context.ns)
      request.search=new URLSearchParams({query:'{'+Object.entries(context.labels).map(([key,value])=>key+'='+JSON.stringify(value)).join(',')+'}',start:String(anchor-2000000000n),end:String(anchor+2000000000n),direction:'FORWARD',limit:'1500'}).toString()
      const response=await fetch(request,{headers,signal:AbortSignal.timeout(7500)})
      if(!response.ok)throw Error('Historical context status '+response.status)
      const body:any=await response.json()
      if(body.status!=='success'||!Array.isArray(body.data?.result))throw Error('Invalid historical context')
      let count=0
      for(const stream of body.data.result){
        const values=(stream.values||[]).slice().sort((a:any,b:any)=>BigInt(a[0])<BigInt(b[0])?-1:BigInt(a[0])>BigInt(b[0])?1:0)
        count+=values.length
        let block:string[]=[],blockNs='',ambiguous=false
        const timestamps=new Map<string,number>()
        for(const pair of values)timestamps.set(String(pair[0]),(timestamps.get(String(pair[0]))||0)+1)
        for(const [ns,line] of values){
          if(/centralized matricula overlay updated|matricula audited write|credentialization.submission.database-committed|personas-autorizadas.student.save/.test(line)){
            block=[String(line)];blockNs=String(ns);ambiguous=(timestamps.get(String(ns))||0)>1
          }else if(block.length){
            block.push(String(line));ambiguous||=(timestamps.get(String(ns))||0)>1
            if(String(line).trim()==='}'){
              const entry=ambiguous?null:parseConsoleBlock(block,blockNs,stream.stream||{})
              if(!entry){failed++;console.warn('[historical-student-audit] unresolved console block',{code:'AUDIT_LOKI_AMBIGUOUS_BLOCK',at:safeDate(blockNs)})}
              if(entry&&!seen.has(entry.rawHash)){seen.add(entry.rawHash);records.push(entry)}
              block=[]
            }
            if(block.length>100)block=[]
          }
        }
      }
      if(count>=1500)anyTruncated=true
    }catch(error){failed++;console.warn('[historical-student-audit] context failed',{code:'AUDIT_LOKI_CONTEXT_FAILED',message:String((error as Error)?.message||error)})}
  }
  if (!anySuccess) throw lastError || new Error('No history selectors configured')
  return { records, available: true, truncated: anyTruncated, partial: failed > 0 }
}
// Discover retained stream bounds from the index, rather than treating an empty
// week as the beginning of history or imposing the grid's 90-day window.
const boundsCache=new Map<string,{at:number;from:number}>()
const boundsPending=new Map<string,Promise<Date>>()
const historicalStart=async(to:Date)=>{
  const url=allowedLokiUrl()
  url.pathname=url.pathname.replace(/query_range$/, 'index/stats')
  const selectors=parseSelections(process.env.AUDIT_LOKI_SELECTOR||'')
  const headers:Record<string,string>={Accept:'application/json'}
  const token=compact(process.env.AUDIT_LOKI_TOKEN||process.env.LOKI_BEARER_TOKEN)
  const username=compact(process.env.AUDIT_LOKI_USERNAME||process.env.LOKI_USERNAME)
  const password=compact(process.env.AUDIT_LOKI_PASSWORD||process.env.LOKI_PASSWORD)
  if(token)headers.Authorization='Bearer '+token
  else if(username)headers.Authorization='Basic '+Buffer.from(username+':'+password).toString('base64')
  const tenant=compact(process.env.AUDIT_LOKI_TENANT_ID)
  if(tenant)headers['X-Scope-OrgID']=tenant
  const key=[url.toString(),selectors.join('|'),tenant,hash12(headers.Authorization||'')].join('|')
  const cached=boundsCache.get(key)
  if(cached&&Date.now()-cached.at<300000)return new Date(cached.from)
  const existing=boundsPending.get(key)
  if(existing)return existing
  const compute=async()=>{
  const hasData=async(from:number,end:number)=>{
    const results=await Promise.all(selectors.map(async selector=>{
      const request=new URL(url)
      request.search=new URLSearchParams({query:selector,start:String(BigInt(Math.floor(from))*1000000n),end:String(BigInt(Math.floor(end))*1000000n)}).toString()
      const response=await fetch(request,{headers,signal:AbortSignal.timeout(7500)})
      if(!response.ok)throw new Error('Historical index status '+response.status)
      const body:any=await response.json()
      if(typeof body.entries!=='number'||typeof body.chunks!=='number'||!Number.isFinite(body.entries)||!Number.isFinite(body.chunks)||body.entries<0||body.chunks<0)throw new Error('Historical index returned invalid bounds')
      return Number(body.entries)>0||Number(body.chunks)>0
    }))
    return results.some(Boolean)
  }
  const end=to.getTime()
  let from=Math.max(0,end-7*86400000) // Include recent, not-yet-indexed ingester data.
  if(await hasData(0,end)){
    let low=0,high=end
    while(high-low>86400000){const mid=Math.floor((low+high)/2);if(await hasData(low,mid))high=mid;else low=mid}
    from=Math.min(from,Math.max(0,Math.floor(low/86400000)*86400000-86400000))
  }
  if(boundsCache.size>6)boundsCache.clear()
  boundsCache.set(key,{at:Date.now(),from})
  return new Date(from)
  }
  const pending=compute();boundsPending.set(key,pending)
  try{return await pending}finally{boundsPending.delete(key)}
}
type Account = { matricula: string; userId: number; name?: string }
let accountsCache: { at: number; byMatricula: Map<string,Account>; byHash: Map<string,Account> } | null = null
const resolveHistoricalAccounts = async () => {
  if (accountsCache && Date.now() - accountsCache.at < 300000) return accountsCache
  const byMatricula = new Map<string,Account>()
  const byHash = new Map<string,Account>()
  // Username is the student matrícula for family accounts. Older logger hashes are reproducible, not reversible.
  const students = await controlEscolarCentralQuery<any[]>('SELECT matricula FROM matricula WHERE matricula IS NOT NULL')
  for (const student of students) {
    const raw = compact(student.matricula)
    const matricula = raw.toUpperCase()
    if (!/^[A-Z]{1,6}\d{2,8}$/.test(matricula)) continue
    const account = { matricula, userId: 0 }
    byMatricula.set(matricula, account)
    for (const value of [raw, matricula, matricula.toLowerCase()]) byHash.set(hash12(value), account)
  }
  const users = await controlEscolarCentralQuery<any[]>(
    "SELECT id, username FROM users WHERE username REGEXP '^[A-Za-z]{1,6}[0-9]{2,8}$' LIMIT 40000"
  ).catch(() => [])
  for (const user of users) {
    const matricula = compact(user.username).toUpperCase()
    const account = { matricula, userId: Number(user.id || 0) }
    byMatricula.set(matricula, account)
    byHash.set(hash12(matricula), account)
    byHash.set(hash12(account.userId), account)
  }
  accountsCache = { at: Date.now(), byMatricula, byHash }
  return accountsCache
}
const classify = (field: string) => {
  const f = field.toLowerCase().replace(/[_\s-]/g, '')
  if (f === 'grupo') return 'grupo'
  if (/apellido|nombre/.test(f)) return 'nombre'
  if (/grado|nivel|ciclo/.test(f)) return 'grado'
  if (/status|estatus|baja|interno|verified/.test(f)) return 'estatus'
  if (/lugartrabajo/.test(f)) return 'trabajo'
  if (/telefono|email|domicilio|direccion|contacto/.test(f)) return 'contacto'
  return 'otros'
}
const labelFor = (field: string) => ({
  nombres: 'Nombre', grupo: 'Grupo', grado: 'Grado', apellidoPaterno: 'Apellido paterno',
  apellidoMaterno: 'Apellido materno', lugarTrabajoPadre: 'Trabajo del padre',
  lugarTrabajoMadre: 'Trabajo de la madre'
} as Record<string,string>)[field] || field.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')
const historyCache = new Map<string, { at: number; value: {events: HistoricalStudentAction[]; available: boolean; truncated: boolean; partial: boolean; checked: number; unmatched: number} }>()
export const loadHistoricalActions = async (input: {
  from: Date; to: Date; planteles: string[]; matricula?:string; fullHistory?:boolean
}) => {
  if((input.fullHistory||input.matricula)&&!/^[A-Z]{1,6}\d{2,8}$/.test(input.matricula||''))throw new Error('Specific student required for full history')
  const key = input.fullHistory?['all',input.matricula,[...input.planteles].sort().join(',')].join('|'):[input.from.toISOString(), input.to.toISOString(), [...input.planteles].sort().join(','),input.matricula||''].join('|')
  const stored = historyCache.get(key)
  if (stored && Date.now() - stored.at < 90000) return stored.value
  const accounts = await resolveHistoricalAccounts()
  const from=input.fullHistory?await historicalStart(input.to):input.from
  const identityTokens=input.matricula?[input.matricula,...[...accounts.byHash].filter(([,account])=>account.matricula===input.matricula).map(([hash])=>hash)]:[]
  const combined: LokiRecord[] = []
  let truncated = false
  let available = false
  let partial = false
  // Small windows bound memory and server load even for a broad retrospective date selection.
  for (let start = from.getTime(); start < input.to.getTime();) {
    const end = Math.min(start + 7 * 86400000, input.to.getTime())
    const result = await queryLoki(new Date(start), new Date(end), identityTokens)
    combined.push(...result.records)
    truncated ||= result.truncated
    available ||= result.available
    partial ||= result.partial
    start = end
  }
  const result: HistoricalStudentAction[] = []
  const dedupe = new Set<string>()
  let unmatched = 0
  for (const item of combined) {
    if (!item.at) continue
    const matriculaHash = getHash(item.matricula)
    const account = accounts.byMatricula.get(matriculaHash.toUpperCase())
      || accounts.byHash.get(matriculaHash)
      || accounts.byHash.get(getHash(item.userId))
    const matricula = account?.matricula || (/^[A-Z]{1,6}\d{2,8}$/.test(matriculaHash) ? matriculaHash : '')
    if (!matricula) { unmatched++; continue }
    const plantel = allCampuses(matricula)
    if (!input.planteles.includes(plantel)||input.matricula&&matricula!==input.matricula) continue
    const fields = item.changes?.length ? item.changes.map(change=>change.field) : item.source === 'Husky Pass'
      ? (item.message.includes('credentialization.submission.database-committed') ? ['nombres'] : ['perfil_familiar'])
      : (item.fields?.length ? item.fields : ['perfil_escolar'])
    for (const field of Array.from(new Set(fields))) {
      const fingerprint = [item.rawHash, field].join('|')
      if (dedupe.has(fingerprint)) continue
      dedupe.add(fingerprint)
      const diff=item.changes?.find(change=>change.field===field)
      result.push({
        id: 'history:' + item.rawHash.slice(0, 20) + ':' + field,
        eventId: 0, relatedEventId:item.auditEventId, date: item.at.slice(0,10), recordedAt: item.at,
        matricula, student: matricula, field, fieldLabel: field === 'nombres' && item.source === 'Husky Pass' ? 'Identidad · credencialización' : labelFor(field),
        category: classify(field), before: diff?diff.before:null, after:diff?diff.after:null,
        source: item.source, actor: item.source === 'Husky Pass' ? 'Husky Pass · Familia' : (item.actor || item.actorEmail || 'Aurora'),
        actorEmail: item.source === 'Aurora' ? item.actorEmail : '',
        avatar: '', flow: item.source === 'Husky Pass' ? 'credencialización' : 'control_escolar',
        quality: diff?'verified':'historical', plantel, ciclo: '', evidenceHash: item.rawHash
      })
    }
  }
  const value = { events: result, available, truncated, partial, checked: combined.length, unmatched }
  console.info('[historical-student-audit] capture completed', {checked:combined.length,resolved:result.length,unmatched,partial,truncated,systems:[...new Set(result.map(e=>e.source))]})
  if (historyCache.size > 24) historyCache.clear()
  if(value.available&&!value.partial&&!value.truncated)historyCache.set(key, { at: Date.now(), value })
  return value
}
