import { randomUUID } from 'node:crypto'
import { allowedLokiUrl } from './historical-student-audit'

export const dxProbeId = randomUUID()
const recent = new Map<string, any>()
const usageKey = (record: any) => [record.routeId, record.plantel, record.ciclo, record.origin, record.credential, record.probe, record.status >= 200 && record.status < 300 ? 'ok' : 'failed'].join('|')
export const rememberIntegrationUse = (record: any) => {
  const key = usageKey(record)
  recent.set(key, record)
  if (recent.size > 2000) recent.delete(recent.keys().next().value as string)
}
const loadIntegrationHistory = async (allowedPlanteles: string[]) => {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = process.env.AUDIT_LOKI_TOKEN || process.env.LOKI_BEARER_TOKEN
  const user = process.env.AUDIT_LOKI_USERNAME || process.env.LOKI_USERNAME
  const password = process.env.AUDIT_LOKI_PASSWORD || process.env.LOKI_PASSWORD || ''
  if (token) headers.Authorization = 'Bearer ' + token
  else if (user) headers.Authorization = 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
  if (process.env.AUDIT_LOKI_TENANT_ID) headers['X-Scope-OrgID'] = process.env.AUDIT_LOKI_TENANT_ID
  let available = false, truncated = false
  const selectors = ['container_name', 'container', 'service_name'].map(label => '{' + label + '=~".*(aurora|sistema-de-ingresos).*"} |= "[AuroraIntegration]"')
  for (const query of selectors) {
    try {
      const url = allowedLokiUrl()
      url.searchParams.set('query', query)
      url.searchParams.set('start', String(BigInt(Date.now() - 7 * 86400000) * 1000000n))
      url.searchParams.set('end', String(BigInt(Date.now()) * 1000000n))
      url.searchParams.set('direction', 'BACKWARD'); url.searchParams.set('limit', '1500')
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(3500) })
      if (!response.ok) continue
      const body: any = await response.json()
      if (body.status !== 'success') continue
      available = true
      const values: any[] = (body.data?.result || []).flatMap((stream: any) => stream.values || [])
      truncated ||= values.length >= 1500
      for (const [, line] of values) {
        const match = String(line).match(/\[AuroraIntegration\]\s*(\{.*\})/)
        if (!match) continue
        try {
          const record = JSON.parse(match[1])
          if (typeof record.routeId !== 'string' || !Number.isFinite(Date.parse(record.at))) continue
          const key = usageKey(record)
          if (!recent.has(key) || recent.get(key).at < record.at) rememberIntegrationUse(record)
        } catch {}
      }
      if (values.length) break
    } catch {}
  }
  return { available, truncated, windowDays: 7, records: [...recent.values()].filter(record => record.plantel && allowedPlanteles.includes(record.plantel) && Date.now() - Date.parse(record.at) <= 7 * 86400000) }
}

let historyAt = 0
let historyPending: Promise<void> | null = null
let historyState = { available: false, truncated: false, windowDays: 7 }
export const readIntegrationUse = async (allowedPlanteles: string[]) => {
  if (!historyPending && Date.now() - historyAt > 30000) {
    historyAt = Date.now()
    historyPending = loadIntegrationHistory([]).then(result => {
      historyState = { available: result.available, truncated: result.truncated, windowDays: result.windowDays }
    }).finally(() => { historyPending = null })
  }
  if (historyPending) await historyPending
  return { ...historyState, records: [...recent.values()].filter(record => allowedPlanteles.includes(record.plantel) && Date.now() - Date.parse(record.at) <= 7 * 86400000) }
}
