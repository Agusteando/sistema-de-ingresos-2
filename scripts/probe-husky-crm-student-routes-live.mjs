const BASE = 'https://aurora.casitaiedis.edu.mx'
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const SCOPES = ['PREEM', 'CT', 'GM', 'PM', 'PT', 'SM', 'ST']

if (!TOKEN) process.exit(3)

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const upper = (value) => clean(value, 100).toUpperCase()
const strictFresh = (payload) => {
  const policy = clean(payload?.meta?.cachePolicy).toLowerCase()
  return payload?.meta?.freshRequested === true && (policy === 'bypass' || policy === 'central-snapshot-only')
}
const matriculaPrefix = (matricula) => canonicalMatricula(matricula).match(/^[A-Z]+/)?.[0] || ''
const requestPlantel = (matricula) => {
  const prefix = matriculaPrefix(matricula)
  if (prefix === 'CT') return 'PREET'
  if (['PREEM', 'GM', 'PM', 'PT', 'SM', 'ST'].includes(prefix)) return prefix
  return ''
}
const outputPlantel = (matricula, auroraPlantel) => {
  const prefix = matriculaPrefix(matricula)
  if (['PREEM', 'GM', 'PM', 'PT', 'SM', 'ST', 'CT'].includes(prefix)) return prefix
  const raw = upper(auroraPlantel)
  if (raw === 'PREET') return 'CT'
  return raw || null
}

async function api(path) {
  const response = await fetch(new URL(path, BASE), {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${TOKEN}`,
      'x-api-key': TOKEN,
      'x-aurora-token': TOKEN,
      'x-husky-pass-client': 'husky-pass-student-route-parity',
      'cache-control': 'no-store, no-cache, max-age=0, must-revalidate',
      pragma: 'no-cache'
    },
    signal: AbortSignal.timeout(120000)
  })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch {}
  return { ok: response.ok, status: response.status, payload }
}

async function readSample(scope, ciclo) {
  const url = new URL('/api/external/v1/control-escolar/students', BASE)
  url.searchParams.set('plantel', scope)
  url.searchParams.set('ciclo', ciclo)
  url.searchParams.set('limit', '5')
  url.searchParams.set('all', '1')
  url.searchParams.set('phase', 'enriched')
  url.searchParams.set('fresh', '1')
  url.searchParams.set('cache', 'bypass')
  url.searchParams.set('_huskyFresh', `${Date.now()}-${scope}`)
  const result = await api(`${url.pathname}${url.search}`)
  if (!result.ok || !Array.isArray(result.payload?.data) || !result.payload.data.length) {
    throw new Error(`${scope}: unable to obtain canonical sample (${result.status})`)
  }
  return result.payload.data
}

const cycleResult = await api('/api/external/v1/school-cycle')
const ciclo = clean(cycleResult.payload?.currentCycle?.label || cycleResult.payload?.currentCycle?.key || cycleResult.payload?.ciclo)
if (!ciclo) throw new Error('Missing current cycle')

const results = []
let sampled = 0
let exactAccepted = 0
let metaRejectedAcademic = 0
let metaRejectedDetail = 0
let requestFailures = 0
let fieldDiffs = 0

for (const scope of SCOPES) {
  const rows = await readSample(scope, ciclo)
  let scopeChecked = 0
  let scopeExact = 0
  let scopeAcademicMetaRejected = 0
  let scopeDetailMetaRejected = 0
  let scopeRequestFailures = 0
  let scopeFieldDiffs = 0

  for (const canonical of rows) {
    const matricula = canonicalMatricula(canonical?.matricula)
    if (!matricula) continue
    sampled += 1
    scopeChecked += 1
    const plantel = requestPlantel(matricula)
    const common = new URLSearchParams({ ciclo, fresh: '1', cache: 'bypass', _huskyFresh: `${Date.now()}-${Math.random()}` })
    if (plantel) common.set('plantel', plantel)

    const academic = await api(`/api/external/v1/control-escolar/academic/${encodeURIComponent(matricula)}?${common}`)
    const detail = await api(`/api/external/v1/control-escolar/students/${encodeURIComponent(matricula)}?${common}`)
    if (!academic.ok || !detail.ok) {
      requestFailures += 1
      scopeRequestFailures += 1
      continue
    }

    const academicAccepted = strictFresh(academic.payload)
    const detailAccepted = strictFresh(detail.payload)
    if (!academicAccepted) {
      metaRejectedAcademic += 1
      scopeAcademicMetaRejected += 1
    }
    if (!detailAccepted) {
      metaRejectedDetail += 1
      scopeDetailMetaRejected += 1
    }
    if (!academicAccepted || !detailAccepted) continue

    const actual = {
      plantel: outputPlantel(matricula, academic.payload?.data?.plantel),
      nivel: upper(academic.payload?.data?.nivel),
      grado: upper(academic.payload?.data?.grado),
      grupo: upper(detail.payload?.data?.grupo || detail.payload?.data?.group)
    }
    const expected = {
      plantel: scope,
      nivel: upper(canonical?.nivel),
      grado: upper(canonical?.grado),
      grupo: upper(canonical?.grupo || canonical?.group)
    }
    const differs = Object.keys(expected).some((key) => upper(expected[key]) !== upper(actual[key]))
    if (differs) {
      fieldDiffs += 1
      scopeFieldDiffs += 1
    } else {
      exactAccepted += 1
      scopeExact += 1
    }
  }

  results.push({
    scope,
    checked: scopeChecked,
    exactAccepted: scopeExact,
    academicMetaRejected: scopeAcademicMetaRejected,
    detailMetaRejected: scopeDetailMetaRejected,
    requestFailures: scopeRequestFailures,
    fieldDiffs: scopeFieldDiffs
  })
}

const summary = {
  ciclo,
  sampled,
  exactAccepted,
  academicMetaRejected: metaRejectedAcademic,
  detailMetaRejected: metaRejectedDetail,
  requestFailures,
  fieldDiffs,
  results
}
console.log(JSON.stringify(summary))

if (requestFailures || fieldDiffs || metaRejectedAcademic || metaRejectedDetail) {
  console.error('HUSKY_CRM_REAL_STUDENT_ROUTE_PARITY_FAILED')
  process.exit(2)
}
console.log('HUSKY_CRM_REAL_STUDENT_ROUTE_PARITY_OK')
