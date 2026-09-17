import { PLANTELES_LIST } from '../../utils/constants'

type DxParamType = 'text' | 'number' | 'boolean'

export type DxApiParam = {
  key: string
  label: string
  type?: DxParamType
  required?: boolean
  path?: boolean
  default?: string
}

export type DxApiEndpoint = {
  id: string
  group: string
  label: string
  method: string
  path: string
  description: string
  params: DxApiParam[]
  runnable: boolean
  autoTest?: boolean
  reason?: string
}

export type DxApiSimulation = {
  id: string
  appId: string
  app: string
  label: string
  endpointId: string
  header: 'x-api-key' | 'x-aurora-token'
  fixedParams?: Record<string, string>
  paginate?: boolean
  verifiedDirect: boolean
  note: string
}

export type DxApp = {
  id: string
  label: string
  simulationIds: string[]
}

const param = (key: string, label: string, options: Partial<DxApiParam> = {}): DxApiParam => ({ key, label, type: 'text', ...options })
const plantel = param('plantel', 'Plantel', { default: 'PREEM' })
const ciclo = param('ciclo', 'Ciclo', { default: '' })
const matricula = param('matricula', 'Matrícula', { required: true, path: true })
const query = param('q', 'Búsqueda')
const limit = param('limit', 'Límite', { type: 'number', default: '100' })

export const DX_API_ENDPOINTS: DxApiEndpoint[] = [
  { id: 'school-cycle', group: 'General', label: 'Ciclo escolar', method: 'GET', path: '/api/external/v1/school-cycle', description: 'Ciclo institucional vigente.', params: [], runnable: true, autoTest: true },
  { id: 'ce-health', group: 'Control Escolar', label: 'Health', method: 'GET', path: '/api/external/v1/control-escolar/health', description: 'Salud de la API pública de Control Escolar.', params: [], runnable: true, autoTest: true },
  { id: 'ce-auth-diagnostics', group: 'Control Escolar', label: 'Auth diagnostics', method: 'GET', path: '/api/external/v1/control-escolar/auth/diagnostics', description: 'Diagnóstico de autenticación sin revelar credenciales.', params: [], runnable: true, autoTest: true },
  { id: 'ce-auth-echo', group: 'Control Escolar', label: 'Auth echo', method: 'GET', path: '/api/external/v1/control-escolar/auth/echo', description: 'Confirma el contrato de autenticación externo.', params: [], runnable: true, autoTest: true },
  { id: 'ce-kpis', group: 'Control Escolar', label: 'KPIs', method: 'GET', path: '/api/external/v1/control-escolar/kpis', description: 'KPIs del snapshot público.', params: [plantel, ciclo], runnable: true },
  { id: 'ce-students', group: 'Control Escolar', label: 'Alumnos', method: 'GET', path: '/api/external/v1/control-escolar/students', description: 'Padrón público paginado de Control Escolar.', params: [plantel, ciclo, query, param('status', 'Estado'), param('fresh', 'Fresh', { type: 'boolean' }), limit, param('cursor', 'Cursor')], runnable: true },
  { id: 'ce-student', group: 'Control Escolar', label: 'Alumno por matrícula', method: 'GET', path: '/api/external/v1/control-escolar/students/:matricula', description: 'Alumno puntual por matrícula.', params: [matricula, ciclo, plantel], runnable: true },
  { id: 'ce-academic', group: 'Control Escolar', label: 'Académico por matrícula', method: 'GET', path: '/api/external/v1/control-escolar/academic/:matricula', description: 'Resolución académica puntual usada por integraciones.', params: [matricula, ciclo, plantel], runnable: true },
  { id: 'ce-changes', group: 'Control Escolar', label: 'Cambios', method: 'GET', path: '/api/external/v1/control-escolar/students/changes', description: 'Cambios del padrón externo.', params: [plantel, ciclo, param('since', 'Desde')], runnable: true },
  { id: 'ce-export', group: 'Control Escolar', label: 'Export', method: 'GET', path: '/api/external/v1/control-escolar/export', description: 'Exportación pública de Control Escolar.', params: [plantel, ciclo], runnable: true },
  { id: 'ce-warm-get', group: 'Control Escolar', label: 'Warm status', method: 'GET', path: '/api/external/v1/control-escolar/warm', description: 'Consulta del estado del warm-up.', params: [plantel, ciclo], runnable: false, reason: 'Operación de warm-up bloqueada en DX.' },
  { id: 'ce-student-patch', group: 'Control Escolar', label: 'Actualizar alumno', method: 'PATCH', path: '/api/external/v1/control-escolar/students/:matricula', description: 'Mutación de alumno.', params: [matricula], runnable: false, reason: 'Mutación bloqueada.' },
  { id: 'ce-warm-post', group: 'Control Escolar', label: 'Warm', method: 'POST', path: '/api/external/v1/control-escolar/warm', description: 'Regenera/calienta datos.', params: [plantel, ciclo], runnable: false, reason: 'Mutación operativa bloqueada.' },
  { id: 'deudores', group: 'Finanzas', label: 'Deudores', method: 'GET', path: '/api/external/v1/deudores', description: 'Consulta externa de deudores.', params: [plantel, ciclo, param('matricula', 'Matrícula')], runnable: true },
  { id: 'husky-account', group: 'Husky Pass', label: 'Cuenta Husky Pass', method: 'GET', path: '/api/external/v1/husky-pass/account', description: 'Cuenta financiera/académica por matrícula.', params: [param('matricula', 'Matrícula', { required: true }), ciclo], runnable: true },
  { id: 'summer-health', group: 'Summer', label: 'Health', method: 'GET', path: '/api/external/v1/summer/health', description: 'Salud de Summer.', params: [], runnable: true, autoTest: true },
  { id: 'summer-diagnostics', group: 'Summer', label: 'Diagnostics', method: 'GET', path: '/api/external/v1/summer/diagnostics', description: 'Diagnóstico de Summer.', params: [], runnable: true, autoTest: true },
  { id: 'summer-students', group: 'Summer', label: 'Alumnos', method: 'GET', path: '/api/external/v1/summer/students', description: 'Padrón de Summer.', params: [plantel, ciclo, query, limit], runnable: true },
  { id: 'summer-photo', group: 'Summer', label: 'Foto', method: 'GET', path: '/api/external/v1/summer/students/:matricula/photo', description: 'Foto de alumno.', params: [matricula], runnable: false, reason: 'Respuesta binaria; no se ejecuta desde el visor JSON.' },
  { id: 'talleres-health', group: 'Talleres', label: 'Health', method: 'GET', path: '/api/external/v1/talleres/health', description: 'Salud del contrato de Talleres.', params: [], runnable: true, autoTest: true },
  { id: 'talleres-meta', group: 'Talleres', label: 'Meta', method: 'GET', path: '/api/external/v1/talleres/meta', description: 'Catálogos y metadatos consumidos por Talleres.', params: [], runnable: true, autoTest: true },
  { id: 'talleres-roster', group: 'Talleres', label: 'Roster', method: 'GET', path: '/api/external/v1/talleres/roster', description: 'Roster real consumido por Talleres.', params: [plantel, ciclo], runnable: true },
  { id: 'talleres-search', group: 'Talleres', label: 'Buscar alumnos', method: 'GET', path: '/api/external/v1/talleres/students/search', description: 'Búsqueda real consumida por Talleres.', params: [param('q', 'Búsqueda', { required: true }), plantel, ciclo], runnable: true },
  { id: 'talleres-dias-put', group: 'Talleres', label: 'Actualizar días', method: 'PUT', path: '/api/external/v1/talleres/students/:matricula/dias', description: 'Mutación de días de taller.', params: [matricula], runnable: false, reason: 'Mutación bloqueada.' },
  { id: 'talleres-talleres-put', group: 'Talleres', label: 'Actualizar talleres', method: 'PUT', path: '/api/external/v1/talleres/students/:matricula/talleres', description: 'Mutación de talleres.', params: [matricula], runnable: false, reason: 'Mutación bloqueada.' },
  { id: 'talleres-warm', group: 'Talleres', label: 'Warm', method: 'POST', path: '/api/external/v1/talleres/warm', description: 'Warm-up de Talleres.', params: [plantel, ciclo], runnable: false, reason: 'Mutación operativa bloqueada.' },
  { id: 'conceptos-update', group: 'Conceptos', label: 'Actualizar conceptos', method: 'POST', path: '/api/external/v1/conceptos/update', description: 'Actualiza conceptos externos.', params: [], runnable: false, reason: 'Mutación bloqueada.' },
  { id: 'talleres-options', group: 'Talleres', label: 'CORS OPTIONS', method: 'OPTIONS', path: '/api/external/v1/talleres/*', description: 'Handler de transporte CORS.', params: [], runnable: false, reason: 'Handler de transporte; no contiene datos.' }
]

export const DX_API_SIMULATIONS: DxApiSimulation[] = [
  { id: 'lista-cycle', appId: 'lista', app: 'Lista de Caritas', label: 'Resolver ciclo', endpointId: 'school-cycle', header: 'x-api-key', verifiedDirect: true, note: 'GET real usado para resolver el ciclo.' },
  { id: 'lista-roster', appId: 'lista', app: 'Lista de Caritas', label: 'Padrón', endpointId: 'ce-students', header: 'x-api-key', fixedParams: { fresh: '1', status: 'inscrito', limit: '500' }, paginate: true, verifiedDirect: true, note: 'Padrón por plantel con cursor.' },
  { id: 'talleres-health-sim', appId: 'talleres', app: 'Talleres', label: 'Health', endpointId: 'talleres-health', header: 'x-aurora-token', verifiedDirect: true, note: 'Salud del contrato Talleres.' },
  { id: 'talleres-meta-sim', appId: 'talleres', app: 'Talleres', label: 'Meta', endpointId: 'talleres-meta', header: 'x-aurora-token', verifiedDirect: true, note: 'Catálogos y metadatos Talleres.' },
  { id: 'talleres-roster-sim', appId: 'talleres', app: 'Talleres', label: 'Roster', endpointId: 'talleres-roster', header: 'x-aurora-token', verifiedDirect: true, note: 'Roster por plantel y ciclo.' },
  { id: 'talleres-search-sim', appId: 'talleres', app: 'Talleres', label: 'Buscar alumno', endpointId: 'talleres-search', header: 'x-aurora-token', verifiedDirect: true, note: 'Búsqueda con una matrícula real derivada por Auto-DX.' },
  { id: 'scanner-roster', appId: 'scanner', app: 'Escáner Husky Pass', label: 'Snapshot académico', endpointId: 'ce-students', header: 'x-api-key', fixedParams: { fresh: '1', limit: '500' }, paginate: true, verifiedDirect: true, note: 'Bulk académico por plantel y ciclo.' },
  { id: 'scanner-academic', appId: 'scanner', app: 'Escáner Husky Pass', label: 'Alumno puntual', endpointId: 'ce-academic', header: 'x-api-key', verifiedDirect: true, note: 'Fallback puntual usando una matrícula real.' },
  { id: 'husky-account-contract', appId: 'husky', app: 'Husky Pass', label: 'Cuenta Aurora', endpointId: 'husky-account', header: 'x-api-key', verifiedDirect: false, note: 'Contrato dedicado disponible en Aurora.' }
]

export const DX_APPS: DxApp[] = [
  { id: 'lista', label: 'Lista de Caritas', simulationIds: ['lista-cycle', 'lista-roster'] },
  { id: 'talleres', label: 'Talleres', simulationIds: ['talleres-health-sim', 'talleres-meta-sim', 'talleres-roster-sim', 'talleres-search-sim'] },
  { id: 'scanner', label: 'Escáner Husky Pass', simulationIds: ['scanner-roster', 'scanner-academic'] },
  { id: 'husky', label: 'Husky Pass', simulationIds: ['husky-account-contract'] }
]

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const endpointById = (id: string) => DX_API_ENDPOINTS.find(item => item.id === id)
const simulationById = (id: string) => DX_API_SIMULATIONS.find(item => item.id === id)

const currentCycleLabel = () => {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

export const getDxApiCatalog = () => ({
  endpoints: DX_API_ENDPOINTS,
  simulations: DX_API_SIMULATIONS,
  apps: DX_APPS,
  planteles: [...PLANTELES_LIST],
  defaults: { plantel: '', ciclo: currentCycleLabel(), limit: '500', fresh: '1', status: 'inscrito', q: '', matricula: '' }
})

const tokenForHeader = (headerName: 'x-api-key' | 'x-aurora-token') => {
  const config = useRuntimeConfig() as any
  const general = [
    process.env.AURORA_API_TOKEN,
    process.env.AURORA_STUDENTS_API_TOKEN,
    process.env.EXTERNAL_CONTROL_ESCOLAR_API_TOKEN,
    config.auroraApiToken,
    config.externalControlEscolarApiToken
  ]
  const talleres = [
    process.env.TALLERES_AURORA_API_TOKEN,
    process.env.AURORA_API_TOKEN,
    config.auroraApiToken
  ]
  const values = headerName === 'x-aurora-token' ? talleres : general
  return values.map(value => clean(value, 4096).replace(/^['\"]|['\"]$/g, '').replace(/^Bearer\s+/i, '').trim()).find(Boolean) || ''
}

const safeParamValue = (paramDef: DxApiParam, value: unknown) => {
  const raw = clean(value, 500)
  if (!raw) return ''
  if (paramDef.type === 'number') {
    const number = Number(raw)
    if (!Number.isFinite(number)) return ''
    return String(Math.max(1, Math.min(5000, Math.trunc(number))))
  }
  if (paramDef.type === 'boolean') return /^(1|true|yes|si)$/i.test(raw) ? '1' : /^(0|false|no)$/i.test(raw) ? '0' : ''
  return raw
}

const prepareRequest = (endpoint: DxApiEndpoint, values: Record<string, unknown>) => {
  let path = endpoint.path
  const queryParams = new URLSearchParams()
  for (const paramDef of endpoint.params) {
    const value = safeParamValue(paramDef, values[paramDef.key] ?? paramDef.default ?? '')
    if (paramDef.required && !value) throw createError({ statusCode: 400, message: `${paramDef.label} es requerido.` })
    if (!value) continue
    if (paramDef.path) {
      if (path.includes(`:${paramDef.key}`)) path = path.replace(`:${paramDef.key}`, encodeURIComponent(value))
      else queryParams.set(paramDef.key, value)
    } else queryParams.set(paramDef.key, value)
  }
  if (path.includes(':')) throw createError({ statusCode: 400, message: 'Falta un parámetro de ruta requerido.' })
  const search = queryParams.toString()
  return `${path}${search ? `?${search}` : ''}`
}

const readNextCursor = (payload: any) => clean(payload?.pagination?.nextCursor || payload?.meta?.nextCursor || payload?.nextCursor, 1000)

const extractRows = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  for (const candidate of [payload?.data, payload?.students, payload?.rows, payload?.results, payload?.items, payload?.conceptos, payload?.recibos]) {
    if (Array.isArray(candidate)) return candidate
  }
  if (payload && typeof payload === 'object') {
    if (payload.alumno && typeof payload.alumno === 'object') return [payload.alumno]
    return [payload]
  }
  return payload == null ? [] : [{ value: payload }]
}

const payloadMeta = (payload: any) => payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}

export const runDxApiRequest = async (event: any, body: any = {}) => {
  const simulation = body?.simulationId ? simulationById(clean(body.simulationId, 100)) : null
  const endpoint = endpointById(clean(simulation?.endpointId || body?.endpointId, 100))
  if (!endpoint) throw createError({ statusCode: 404, message: 'Endpoint DX no reconocido.' })
  if (!endpoint.runnable || endpoint.method !== 'GET') {
    throw createError({ statusCode: 405, message: endpoint.reason || 'Este endpoint no puede ejecutarse desde DX.' })
  }

  const headerName = simulation?.header || 'x-api-key'
  const token = tokenForHeader(headerName)
  if (!token) throw createError({ statusCode: 503, message: `Aurora no tiene credencial ${headerName} configurada para ejecutar la simulación.` })
  const localFetch = event?.$fetch
  if (typeof localFetch !== 'function') throw createError({ statusCode: 500, message: 'El fetch interno de Aurora no está disponible.' })

  const userParams = body?.params && typeof body.params === 'object' ? body.params : {}
  const mergedParams: Record<string, unknown> = { ...userParams, ...(simulation?.fixedParams || {}) }
  const started = Date.now()
  const rows: any[] = []
  const requests: string[] = []
  let rawPayload: any = null
  let lastPayload: any = null
  let cursor = ''
  let pages = 0
  let truncated = false

  try {
    do {
      const requestParams = { ...mergedParams, ...(cursor ? { cursor } : {}) }
      const requestPath = prepareRequest(endpoint, requestParams)
      requests.push(requestPath)
      const payload = await localFetch(requestPath, {
        method: 'GET',
        headers: { Accept: 'application/json', [headerName]: token },
        retry: 0
      })
      pages += 1
      if (rawPayload === null) rawPayload = payload
      lastPayload = payload
      rows.push(...extractRows(payload))
      cursor = simulation?.paginate ? readNextCursor(payload) : ''
      if (rows.length >= 5000) {
        rows.splice(5000)
        truncated = Boolean(cursor)
        cursor = ''
      }
      if (pages >= 20 && cursor) {
        truncated = true
        cursor = ''
      }
    } while (cursor)

    const meta = { ...payloadMeta(rawPayload), ...payloadMeta(lastPayload) }
    return {
      ok: true,
      status: 200,
      endpointId: endpoint.id,
      simulationId: simulation?.id || null,
      app: simulation?.app || null,
      appId: simulation?.appId || null,
      label: simulation?.label || endpoint.label,
      verifiedDirect: simulation?.verifiedDirect ?? null,
      request: requests[0] || endpoint.path,
      requests,
      header: `${headerName}: [server-side credential]`,
      latencyMs: Date.now() - started,
      pages,
      rowCount: rows.length,
      truncated,
      source: meta?.source ?? null,
      fallback: meta?.fallback ?? null,
      cachePolicy: meta?.cachePolicy ?? null,
      meta,
      rows,
      rawPayload
    }
  } catch (error: any) {
    const status = Number(error?.response?.status || error?.statusCode || error?.status || 500) || 500
    const payload = error?.data || error?.response?._data || null
    return {
      ok: false,
      status,
      endpointId: endpoint.id,
      simulationId: simulation?.id || null,
      app: simulation?.app || null,
      appId: simulation?.appId || null,
      label: simulation?.label || endpoint.label,
      verifiedDirect: simulation?.verifiedDirect ?? null,
      request: requests[requests.length - 1] || endpoint.path,
      requests,
      header: `${headerName}: [server-side credential]`,
      latencyMs: Date.now() - started,
      pages,
      rowCount: rows.length,
      truncated,
      source: payload?.meta?.source ?? null,
      fallback: payload?.meta?.fallback ?? null,
      cachePolicy: payload?.meta?.cachePolicy ?? null,
      meta: payload?.meta || null,
      rows,
      rawPayload: payload,
      error: {
        code: clean(payload?.data?.code || payload?.code || error?.statusMessage || error?.name || 'DX_REQUEST_FAILED', 120),
        message: clean(payload?.message || error?.message || 'La API respondió con error.', 1000)
      }
    }
  }
}

const matriculaFromRow = (row: any) => clean(row?.matricula || row?.studentId || row?.alumno?.matricula, 64)
const labelFromRow = (row: any) => clean(row?.nombreCompleto || row?.fullName || row?.display?.nombre || matriculaFromRow(row), 255)

const compactDxResult = (result: any, params: Record<string, string>) => ({
  ok: Boolean(result?.ok),
  status: Number(result?.status || 0),
  endpointId: result?.endpointId || null,
  simulationId: result?.simulationId || null,
  label: result?.label || null,
  verifiedDirect: result?.verifiedDirect ?? null,
  request: result?.request || null,
  requests: Array.isArray(result?.requests) ? result.requests : [],
  latencyMs: Number(result?.latencyMs || 0),
  pages: Number(result?.pages || 0),
  rowCount: Number(result?.rowCount || 0),
  truncated: Boolean(result?.truncated),
  source: result?.source ?? null,
  fallback: result?.fallback ?? null,
  cachePolicy: result?.cachePolicy ?? null,
  error: result?.error || null,
  params,
  previewRows: Array.isArray(result?.rows) ? result.rows.slice(0, 5) : []
})

const safeRun = async (event: any, simulationId: string, params: Record<string, string>) => {
  try {
    return await runDxApiRequest(event, { simulationId, params })
  } catch (error: any) {
    return {
      ok: false,
      status: Number(error?.statusCode || 500),
      simulationId,
      endpointId: simulationById(simulationId)?.endpointId || null,
      label: simulationById(simulationId)?.label || simulationId,
      latencyMs: 0,
      rowCount: 0,
      pages: 0,
      rows: [],
      error: { code: clean(error?.statusMessage || error?.name || 'DX_AUTO_FAILED', 120), message: clean(error?.message || 'Auto-DX falló.', 1000) }
    }
  }
}

export const runDxPlantelAutoDx = async (event: any, body: any = {}) => {
  const plantelValue = clean(body?.plantel, 40).toUpperCase()
  if (!PLANTELES_LIST.includes(plantelValue)) {
    throw createError({ statusCode: 400, message: 'Plantel DX no reconocido.' })
  }
  const cicloValue = clean(body?.ciclo, 20) || currentCycleLabel()
  const commonParams: Record<string, string> = {
    plantel: plantelValue,
    ciclo: cicloValue,
    fresh: '1',
    status: 'inscrito',
    limit: '500'
  }

  const cache = new Map<string, any>()
  const runSimulation = async (simulationId: string, extra: Record<string, string> = {}) => {
    const params = { ...commonParams, ...extra }
    const cacheKey = `${simulationId}:${JSON.stringify(params)}`
    if (!cache.has(cacheKey)) cache.set(cacheKey, await safeRun(event, simulationId, params))
    return { result: cache.get(cacheKey), params }
  }

  let baseline = await runSimulation('scanner-roster')
  if (!baseline.result?.ok || !Array.isArray(baseline.result?.rows) || !baseline.result.rows.length) {
    baseline = await runSimulation('lista-roster')
  }
  const sampleRow = (baseline.result?.rows || []).find((row: any) => matriculaFromRow(row)) || null
  const sampleMatricula = matriculaFromRow(sampleRow)
  const sampleLabel = labelFromRow(sampleRow)
  const derived: Record<string, string> = {
    matricula: sampleMatricula,
    q: sampleMatricula || sampleLabel,
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }

  const simulationResults = new Map<string, { result: any; params: Record<string, string> }>()
  simulationResults.set('scanner-roster', baseline)

  for (const simulation of DX_API_SIMULATIONS) {
    if (simulationResults.has(simulation.id)) continue
    simulationResults.set(simulation.id, await runSimulation(simulation.id, derived))
  }

  const apps = DX_APPS.map((app) => {
    const endpoints = app.simulationIds.map((simulationId) => {
      const entry = simulationResults.get(simulationId) || { result: null, params: { ...commonParams, ...derived } }
      return compactDxResult(entry.result, entry.params)
    })
    const okCount = endpoints.filter(endpoint => endpoint.ok).length
    const status = okCount === endpoints.length ? 'ok' : okCount > 0 ? 'partial' : 'error'
    return {
      appId: app.id,
      app: app.label,
      status,
      okEndpoints: okCount,
      totalEndpoints: endpoints.length,
      latencyMs: endpoints.reduce((sum, endpoint) => sum + Number(endpoint.latencyMs || 0), 0),
      rowCount: endpoints.reduce((sum, endpoint) => sum + Number(endpoint.rowCount || 0), 0),
      endpoints
    }
  })

  return {
    ok: apps.every(app => app.status === 'ok'),
    plantel: plantelValue,
    ciclo: cicloValue,
    testedAt: new Date().toISOString(),
    sample: sampleRow ? { matricula: sampleMatricula, label: sampleLabel } : null,
    apps
  }
}
