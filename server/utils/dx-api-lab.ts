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
  app: string
  label: string
  endpointId: string
  header: 'x-api-key' | 'x-aurora-token'
  fixedParams?: Record<string, string>
  paginate?: boolean
  verifiedDirect: boolean
  note: string
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
  { id: 'ce-student', group: 'Control Escolar', label: 'Alumno por matrícula', method: 'GET', path: '/api/external/v1/control-escolar/students/:matricula', description: 'Alumno puntual por matrícula.', params: [matricula, ciclo], runnable: true },
  { id: 'ce-academic', group: 'Control Escolar', label: 'Académico por matrícula', method: 'GET', path: '/api/external/v1/control-escolar/academic/:matricula', description: 'Resolución académica puntual usada por integraciones.', params: [matricula, ciclo], runnable: true },
  { id: 'ce-changes', group: 'Control Escolar', label: 'Cambios', method: 'GET', path: '/api/external/v1/control-escolar/students/changes', description: 'Cambios del padrón externo.', params: [plantel, ciclo, param('since', 'Desde')], runnable: true },
  { id: 'ce-export', group: 'Control Escolar', label: 'Export', method: 'GET', path: '/api/external/v1/control-escolar/export', description: 'Exportación pública de Control Escolar.', params: [plantel, ciclo], runnable: true },
  { id: 'ce-warm-get', group: 'Control Escolar', label: 'Warm status', method: 'GET', path: '/api/external/v1/control-escolar/warm', description: 'Consulta del estado del warm-up.', params: [plantel, ciclo], runnable: false, reason: 'GET con semántica operativa de warm-up; visible pero bloqueado en DX.' },
  { id: 'ce-student-patch', group: 'Control Escolar', label: 'Actualizar alumno', method: 'PATCH', path: '/api/external/v1/control-escolar/students/:matricula', description: 'Mutación de alumno.', params: [matricula], runnable: false, reason: 'Mutación bloqueada.' },
  { id: 'ce-warm-post', group: 'Control Escolar', label: 'Warm', method: 'POST', path: '/api/external/v1/control-escolar/warm', description: 'Regenera/calienta datos.', params: [plantel, ciclo], runnable: false, reason: 'Mutación operativa bloqueada.' },
  { id: 'deudores', group: 'Finanzas', label: 'Deudores', method: 'GET', path: '/api/external/v1/deudores', description: 'Consulta externa de deudores.', params: [plantel, ciclo, matricula], runnable: true },
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
  { id: 'lista-cycle', app: 'Lista de Caritas', label: 'Resolver ciclo', endpointId: 'school-cycle', header: 'x-api-key', verifiedDirect: true, note: 'GET real que Lista de Caritas ejecuta antes de resolver el padrón.' },
  { id: 'lista-roster', app: 'Lista de Caritas', label: 'Padrón por plantel', endpointId: 'ce-students', header: 'x-api-key', fixedParams: { fresh: '1', status: 'inscrito', limit: '500' }, paginate: true, verifiedDirect: true, note: 'Replica plantel + ciclo + fresh=1 + status=inscrito + limit=500 y cursor.' },
  { id: 'talleres-roster-sim', app: 'Talleres', label: 'Roster', endpointId: 'talleres-roster', header: 'x-aurora-token', verifiedDirect: true, note: 'Replica GET /talleres/roster con plantel y ciclo.' },
  { id: 'talleres-search-sim', app: 'Talleres', label: 'Buscar alumno', endpointId: 'talleres-search', header: 'x-aurora-token', verifiedDirect: true, note: 'Replica GET /talleres/students/search con q, plantel y ciclo.' },
  { id: 'scanner-roster', app: 'Escáner Husky Pass', label: 'Snapshot académico', endpointId: 'ce-students', header: 'x-api-key', fixedParams: { fresh: '1', limit: '500' }, paginate: true, verifiedDirect: true, note: 'Replica el bulk de Escáner: plantel + ciclo + fresh=1 + limit=500 y cursor.' },
  { id: 'scanner-academic', app: 'Escáner Husky Pass', label: 'Alumno puntual', endpointId: 'ce-academic', header: 'x-api-key', verifiedDirect: true, note: 'Replica el fallback puntual /academic/:matricula.' },
  { id: 'husky-account-contract', app: 'Husky Pass', label: 'Cuenta Aurora', endpointId: 'husky-account', header: 'x-api-key', verifiedDirect: false, note: 'Aurora expone este contrato dedicado. El repo husky-pass-crm actual no configura una llamada directa a Aurora; su integración externa actual apunta a SIPAE.' }
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
  defaults: { plantel: 'PREEM', ciclo: currentCycleLabel(), limit: '500', fresh: '1', status: 'inscrito', q: '', matricula: '' }
})

const internalApiToken = () => {
  const config = useRuntimeConfig() as any
  const values = [
    process.env.AURORA_API_TOKEN,
    process.env.TALLERES_AURORA_API_TOKEN,
    process.env.HUSKY_PASS_AURORA_API_TOKEN,
    process.env.AURORA_STUDENTS_API_TOKEN,
    process.env.EXTERNAL_CONTROL_ESCOLAR_API_TOKEN,
    config.auroraApiToken,
    config.externalControlEscolarApiToken
  ]
  return values.map(value => clean(value, 4096).replace(/^['\"]|['\"]$/g, '').replace(/^Bearer\s+/i, '').trim()).find(Boolean) || ''
}

const safeParamValue = (param: DxApiParam, value: unknown) => {
  const raw = clean(value, 500)
  if (!raw) return ''
  if (param.type === 'number') {
    const number = Number(raw)
    if (!Number.isFinite(number)) return ''
    return String(Math.max(1, Math.min(5000, Math.trunc(number))))
  }
  if (param.type === 'boolean') return /^(1|true|yes|si)$/i.test(raw) ? '1' : /^(0|false|no)$/i.test(raw) ? '0' : ''
  return raw
}

const prepareRequest = (endpoint: DxApiEndpoint, values: Record<string, unknown>) => {
  let path = endpoint.path
  const queryParams = new URLSearchParams()
  const accepted = new Set(endpoint.params.map(item => item.key))
  for (const paramDef of endpoint.params) {
    const value = safeParamValue(paramDef, values[paramDef.key] ?? paramDef.default ?? '')
    if (paramDef.required && !value) throw createError({ statusCode: 400, message: `${paramDef.label} es requerido.` })
    if (!value) continue
    if (paramDef.path) path = path.replace(`:${paramDef.key}`, encodeURIComponent(value))
    else queryParams.set(paramDef.key, value)
  }
  for (const key of Object.keys(values)) {
    if (!accepted.has(key)) continue
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

  const token = internalApiToken()
  if (!token) throw createError({ statusCode: 503, message: 'Aurora no tiene token externo configurado para ejecutar la simulación.' })
  const localFetch = event?.$fetch
  if (typeof localFetch !== 'function') throw createError({ statusCode: 500, message: 'El fetch interno de Aurora no está disponible.' })

  const userParams = body?.params && typeof body.params === 'object' ? body.params : {}
  const mergedParams: Record<string, unknown> = { ...userParams, ...(simulation?.fixedParams || {}) }
  const headerName = simulation?.header || 'x-api-key'
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
