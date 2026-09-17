const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const REQUESTED_CYCLE = String(process.env.AURORA_TEST_CYCLE || '').trim()

if (!TOKEN) {
  console.error('AURORA_API_TOKEN is not available to this Actions run.')
  process.exit(3)
}

const CONTROL_ESCOLAR_PLANTELES = ['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST']
const TALLERES_PLANTELES = ['PM', 'PT', 'SM', 'ST', 'PREEM', 'CT', 'GM', 'CO', 'DC']
const results = []

const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max)
const url = (path, params = {}) => {
  const target = new URL(path, `${BASE}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    target.searchParams.set(key, String(value))
  }
  return target
}

async function request(name, path, options = {}) {
  const started = Date.now()
  const header = options.header || 'x-api-key'
  const target = url(path, options.params)
  let response
  let parsed = null
  let bytes = 0
  try {
    response = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: options.binary ? '*/*' : 'application/json',
        [header]: TOKEN,
        'User-Agent': 'Aurora-Live-DX/1.0'
      },
      signal: AbortSignal.timeout(options.timeoutMs || 45000)
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    bytes = buffer.length
    if (!options.binary && buffer.length) {
      try { parsed = JSON.parse(buffer.toString('utf8')) } catch { parsed = null }
    }
  } catch (error) {
    const result = { name, ok: false, status: 0, latencyMs: Date.now() - started, code: clean(error?.name || 'TRANSPORT_ERROR'), rows: null }
    results.push(result)
    console.log(`${name}: ERROR transport=${result.code} ${result.latencyMs}ms`)
    return { ...result, data: null }
  }

  const status = Number(response.status || 0)
  const ok = status >= 200 && status < 300
  const payload = parsed && typeof parsed === 'object' ? parsed : null
  const rowsCandidate = Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.students) ? payload.students
      : Array.isArray(payload?.items) ? payload.items
        : null
  const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}
  const code = clean(payload?.data?.code || payload?.code || payload?.statusMessage || '') || null
  const result = {
    name,
    ok,
    status,
    latencyMs: Date.now() - started,
    code,
    rows: rowsCandidate ? rowsCandidate.length : null,
    source: clean(meta?.source) || null,
    freshness: clean(meta?.freshness) || null,
    fallback: meta?.fallback ?? null,
    bytes: options.binary ? bytes : null
  }
  results.push(result)
  console.log(`${name}: HTTP ${status} ${result.latencyMs}ms${result.rows === null ? '' : ` rows=${result.rows}`}${result.source ? ` source=${result.source}` : ''}${result.freshness ? ` freshness=${result.freshness}` : ''}${result.fallback === null ? '' : ` fallback=${result.fallback}`}${result.bytes === null ? '' : ` bytes=${result.bytes}`}${code ? ` code=${code}` : ''}`)
  return { ...result, data: payload }
}

const globalChecks = [
  ['school-cycle', '/api/external/v1/school-cycle', 'x-api-key'],
  ['control-escolar/health', '/api/external/v1/control-escolar/health', 'x-api-key'],
  ['control-escolar/auth/diagnostics', '/api/external/v1/control-escolar/auth/diagnostics', 'x-api-key'],
  ['control-escolar/auth/echo', '/api/external/v1/control-escolar/auth/echo', 'x-api-key'],
  ['summer/health', '/api/external/v1/summer/health', 'x-api-key'],
  ['summer/diagnostics', '/api/external/v1/summer/diagnostics', 'x-api-key'],
  ['talleres/health', '/api/external/v1/talleres/health', 'x-aurora-token'],
  ['talleres/meta', '/api/external/v1/talleres/meta', 'x-aurora-token']
]

console.log('=== Global contracts ===')
let schoolCyclePayload = null
for (const [name, path, header] of globalChecks) {
  const response = await request(name, path, { header })
  if (name === 'school-cycle') schoolCyclePayload = response.data
}

const detectedCycle = clean(
  schoolCyclePayload?.currentCycle?.label ||
  schoolCyclePayload?.currentCycle?.key ||
  schoolCyclePayload?.ciclo ||
  ''
)
const cycle = REQUESTED_CYCLE || detectedCycle
if (!cycle) {
  console.error('Could not determine an academic cycle.')
  process.exit(4)
}
console.log(`cycle=${cycle}`)

const samplesByPlantel = new Map()
console.log('\n=== Control Escolar consumer contract ===')
for (const plantel of CONTROL_ESCOLAR_PLANTELES) {
  const students = await request(`CE ${plantel} students`, '/api/external/v1/control-escolar/students', {
    params: { plantel, ciclo: cycle, status: 'inscrito', limit: 5 }
  })
  const rows = Array.isArray(students.data?.data) ? students.data.data : []
  const sample = rows.find(row => clean(row?.matricula || row?.studentId))
  const matricula = clean(sample?.matricula || sample?.studentId, 64)
  if (matricula) samplesByPlantel.set(plantel, matricula)

  await request(`CE ${plantel} kpis`, '/api/external/v1/control-escolar/kpis', { params: { plantel, ciclo: cycle } })
  await request(`CE ${plantel} changes`, '/api/external/v1/control-escolar/students/changes', {
    params: { plantel, ciclo: cycle, since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
  })

  if (matricula) {
    await request(`CE ${plantel} student`, `/api/external/v1/control-escolar/students/${encodeURIComponent(matricula)}`, { params: { plantel, ciclo: cycle } })
    await request(`CE ${plantel} academic`, `/api/external/v1/control-escolar/academic/${encodeURIComponent(matricula)}`, { params: { plantel, ciclo: cycle } })
    await request(`Husky ${plantel} account`, '/api/external/v1/husky-pass/account', { params: { matricula, ciclo: cycle } })
  } else if (students.ok) {
    console.log(`CE ${plantel}: no sample matricula; targeted reads skipped`)
  }
}

console.log('\n=== Talleres consumer contract ===')
for (const plantel of TALLERES_PLANTELES) {
  const roster = await request(`Talleres ${plantel} roster`, '/api/external/v1/talleres/roster', {
    header: 'x-aurora-token',
    params: { plantel, ciclo: cycle },
    timeoutMs: 90000
  })
  const rows = Array.isArray(roster.data?.students) ? roster.data.students : []
  const sample = rows.find(row => clean(row?.matricula))
  const matricula = clean(sample?.matricula, 64)
  if (matricula) {
    await request(`Talleres ${plantel} search`, '/api/external/v1/talleres/students/search', {
      header: 'x-aurora-token',
      params: { plantel, ciclo: cycle, q: matricula }
    })
  } else if (roster.ok) {
    console.log(`Talleres ${plantel}: empty roster; search skipped`)
  }
}

const failures = results.filter(result => !result.ok)
const healthy = results.length - failures.length
console.log(`\nSUMMARY healthy=${healthy}/${results.length} failures=${failures.length}`)
if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure.name} HTTP=${failure.status} code=${failure.code || '-'}`)
  process.exit(2)
}
