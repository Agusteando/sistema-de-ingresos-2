import { createHash } from 'node:crypto'
import { controlEscolarCentralQuery } from './control-escolar-central'

export type LokiRecord = { at: string; message: string; userId?: unknown; matricula?: unknown; actor?: string; actorEmail?: string; fields?: string[]; source: 'Aurora' | 'Husky Pass'; requestId?: string; rawHash: string }
export type HistoricalStudentAction = {
  id: string; eventId: number; date: string; recordedAt: string; matricula: string
  student: string; field: string; fieldLabel: string; category: string
  before: null; after: null; source: 'Aurora' | 'Husky Pass'
  actor: string; actorEmail: string; avatar: string; flow: string
  quality: 'historical'; plantel: string; ciclo: string
  evidenceHash: string
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
    return get('year') + '-' + get('month') + '-' + get('day') + ' ' + get('hour') + ':' + get('minute') + ':' + get('second')
  } catch { return '' }
}
const getHash = (item: any) => {
  if (item && typeof item === 'object') return String(item.hash || item.redacted?.hash || '')
  return String(item || '')
}
export const parseMessage = (line: string, ns: string, labels: Record<string, string>): LokiRecord | null => {
  let obj: any = {}
  const jsonAt = line.indexOf('{')
  if (jsonAt >= 0) {
    try { obj = JSON.parse(line.slice(jsonAt)) } catch { /* preserve original line */ }
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
  const fields = Array.isArray(obj.fields) ? obj.fields.map(String) : Array.isArray(obj.changedFields) ? obj.changedFields.map(String)
    : Array.from(line.matchAll(/['"]((?:grupo|grado|nivel|ciclo|nombres|apellidoPaterno|apellidoMaterno|lugarTrabajoPadre|lugarTrabajoMadre|emailPadre|emailMadre|telefonoPadre|telefonoMadre))['"]/g)).map(match => match[1])
  return {
    at: safeDate(ns), message,
    userId: obj.userId, matricula, fields,
    source, actor: compact(obj.actorName || obj.userName || obj.actor?.name || actorEmail), actorEmail,
    requestId: compact(obj.requestId),
    rawHash: digest(JSON.stringify({ns, labels, line}))
  }
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
  for (const selector of selectors) {
    let ceiling = endNs
    let truncated = false
    try {
      for (let page = 0; page < 8 && ceiling >= startNs; page++) {
        url.searchParams.set('query', selector + filter + (identityTokens.length?' |~ '+JSON.stringify('(?i)'+identityTokens.join('|')):''))
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
            if (!entry || seen.has(entry.rawHash)) continue
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
    const fields = item.source === 'Husky Pass'
      ? (item.message.includes('credentialization.submission.database-committed') ? ['nombres'] : ['perfil_familiar'])
      : (item.fields?.length ? item.fields : ['perfil_escolar'])
    for (const field of Array.from(new Set(fields))) {
      const fingerprint = [item.rawHash, field].join('|')
      if (dedupe.has(fingerprint)) continue
      dedupe.add(fingerprint)
      result.push({
        id: 'history:' + item.rawHash.slice(0, 20) + ':' + field,
        eventId: 0, date: item.at.slice(0,10), recordedAt: item.at,
        matricula, student: matricula, field, fieldLabel: field === 'nombres' && item.source === 'Husky Pass' ? 'Identidad · credencialización' : labelFor(field),
        category: classify(field), before: null, after: null,
        source: item.source, actor: item.source === 'Husky Pass' ? 'Husky Pass · Familia' : (item.actor || item.actorEmail || 'Aurora'),
        actorEmail: item.source === 'Aurora' ? item.actorEmail : '',
        avatar: '', flow: item.source === 'Husky Pass' ? 'credencialización' : 'control_escolar',
        quality: 'historical', plantel, ciclo: '', evidenceHash: item.rawHash
      })
    }
  }
  const value = { events: result, available, truncated, partial, checked: combined.length, unmatched }
  console.info('[historical-student-audit] capture completed', {checked:combined.length,resolved:result.length,unmatched,partial,truncated,systems:[...new Set(result.map(e=>e.source))]})
  if (historyCache.size > 24) historyCache.clear()
  historyCache.set(key, { at: Date.now(), value })
  return value
}
