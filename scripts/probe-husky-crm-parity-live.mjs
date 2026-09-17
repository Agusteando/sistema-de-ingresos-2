const BASE = 'https://aurora.casitaiedis.edu.mx'
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const SCOPES = ['PREEM', 'CT', 'GM', 'PM', 'PT', 'SM', 'ST']
const SCHOOL_PLANTELES = ['PREEM', 'GM', 'PM', 'PT', 'SM', 'ST', 'CT']

if (!TOKEN) {
  console.error('AURORA_API_TOKEN missing')
  process.exit(3)
}

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const cleanAcademic = (value) => clean(value, 100).toUpperCase()
const lettersOnly = (value) => clean(value, 120).toUpperCase().replace(/[0-9]/g, '').replace(/[^A-Z]/g, '')

function normalizeSchoolPlantel(value) {
  const direct = clean(value, 120).toUpperCase().replace(/\s+/g, '')
  if (SCHOOL_PLANTELES.includes(direct)) return direct
  const letters = lettersOnly(value)
  if (SCHOOL_PLANTELES.includes(letters)) return letters
  return [...SCHOOL_PLANTELES]
    .sort((a, b) => b.length - a.length)
    .find((plantel) => letters.startsWith(plantel)) || null
}

function normalizeAuroraEnrollmentPlantel(value) {
  const words = clean(value, 160)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
  if (!words) return ''
  const compact = words.replace(/\s+/g, '')
  const aliases = {
    GM: 'GM', GUARDERIAMETEPEC: 'GM',
    CT: 'PREET', PREET: 'PREET', PREESCOLARVESPERTINO: 'PREET', PREESCOLARVESPERTINA: 'PREET',
    CM: 'PREEM', PREEM: 'PREEM', PREESCOLARMATUTINO: 'PREEM', PREESCOLARMATUTINA: 'PREEM',
    PMA: 'PM', PMB: 'PM', PM: 'PM', PRIMARIAMATUTINO: 'PM', PRIMARIAMATUTINA: 'PM',
    PT: 'PT', PRIMARIAVESPERTINO: 'PT', PRIMARIAVESPERTINA: 'PT',
    SM: 'SM', SECUNDARIAMATUTINO: 'SM', SECUNDARIAMATUTINA: 'SM',
    ST: 'ST', SECUNDARIAVESPERTINO: 'ST', SECUNDARIAVESPERTINA: 'ST'
  }
  if (aliases[compact]) return aliases[compact]
  const tokens = words.split(/\s+/)
  for (const token of tokens) if (aliases[token]) return aliases[token]
  if (words.includes('PREESCOLAR') && words.includes('VESPERT')) return 'PREET'
  if (words.includes('PREESCOLAR') && words.includes('MATUT')) return 'PREEM'
  if (words.includes('PRIMARIA') && words.includes('VESPERT')) return 'PT'
  if (words.includes('PRIMARIA') && words.includes('MATUT')) return 'PM'
  if (words.includes('SECUNDARIA') && words.includes('VESPERT')) return 'ST'
  if (words.includes('SECUNDARIA') && words.includes('MATUT')) return 'SM'
  return ''
}

function scopeFor(value) {
  const enrollmentScope = normalizeAuroraEnrollmentPlantel(value)
  if (enrollmentScope === 'PREET') return 'CT'
  return enrollmentScope
}

function localPlantel(matricula, value) {
  const byMatricula = normalizeSchoolPlantel(matricula)
  if (byMatricula) return byMatricula
  const raw = clean(value, 80).toUpperCase()
  if (raw === 'PREET') return 'CT'
  return normalizeSchoolPlantel(raw)
}

function placementFromRow(row, ciclo) {
  const matricula = canonicalMatricula(row?.matricula)
  if (!matricula) return null
  return {
    matricula,
    ciclo,
    plantel: localPlantel(matricula, row?.plantel || row?.basePlantel),
    nivel: cleanAcademic(row?.nivel),
    grado: cleanAcademic(row?.grado),
    grupo: cleanAcademic(row?.grupo || row?.group)
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, BASE), {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
      'x-api-key': TOKEN,
      'x-aurora-token': TOKEN,
      'x-husky-pass-client': 'academic-directory-parity-audit',
      'cache-control': 'no-store, no-cache, max-age=0, must-revalidate',
      pragma: 'no-cache',
      'user-agent': 'Husky-CRM-Exact-Parity/1.0'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch {}
  if (!response.ok) {
    const code = clean(payload?.data?.code || payload?.code || payload?.statusMessage || '')
    throw new Error(`${method} ${path} -> HTTP ${response.status}${code ? ` code=${code}` : ''}`)
  }
  return payload
}

async function readScope(scope, ciclo, tag) {
  const rows = []
  let cursor = ''
  let meta = null
  do {
    const url = new URL('/api/external/v1/control-escolar/students', BASE)
    url.searchParams.set('plantel', scope)
    url.searchParams.set('ciclo', ciclo)
    url.searchParams.set('limit', '500')
    url.searchParams.set('all', '1')
    url.searchParams.set('phase', 'enriched')
    url.searchParams.set('fresh', '1')
    url.searchParams.set('cache', 'bypass')
    url.searchParams.set('_huskyFresh', `${Date.now()}-${tag}-${Math.random().toString(16).slice(2)}`)
    if (cursor) url.searchParams.set('cursor', cursor)
    const payload = await api(`${url.pathname}${url.search}`)
    if (!Array.isArray(payload?.data)) throw new Error(`${scope}: response missing data[]`)
    meta ||= payload?.meta || {}
    rows.push(...payload.data)
    cursor = clean(payload?.pagination?.nextCursor, 500)
  } while (cursor)
  return { rows, meta: meta || {} }
}

async function warmScope(scope, ciclo) {
  try {
    const payload = await api('/api/external/v1/control-escolar/warm', {
      method: 'POST',
      body: { plantel: scope, ciclo }
    })
    return { ok: true, payload }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
}

function mapByMatricula(rows) {
  const map = new Map()
  const duplicates = new Set()
  for (const row of rows) {
    const matricula = canonicalMatricula(row?.matricula)
    if (!matricula) continue
    if (map.has(matricula)) duplicates.add(matricula)
    else map.set(matricula, row)
  }
  return { map, duplicates }
}

function inc(map, key) {
  map.set(key, (map.get(key) || 0) + 1)
}

function publicMap(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true })))
}

const cyclePayload = await api('/api/external/v1/school-cycle')
const ciclo = clean(cyclePayload?.currentCycle?.label || cyclePayload?.currentCycle?.key || cyclePayload?.ciclo)
if (!ciclo) throw new Error('Aurora did not return a current cycle')
console.log(JSON.stringify({ test: 'HUSKY_CRM_STUDENT_PARITY', ciclo }))

const before = new Map()
const after = new Map()
const freshness = []
let hardFailure = false

for (const scope of SCOPES) {
  try {
    const pre = await readScope(scope, ciclo, `before-${scope}`)
    before.set(scope, pre)
    const warm = await warmScope(scope, ciclo)
    const post = await readScope(scope, ciclo, `after-${scope}`)
    after.set(scope, post)
    freshness.push({
      scope,
      rowsBefore: pre.rows.length,
      rowsAfter: post.rows.length,
      generatedAtBefore: pre.meta?.generatedAt || null,
      generatedAtAfter: post.meta?.generatedAt || null,
      freshnessBefore: pre.meta?.freshness || null,
      freshnessAfter: post.meta?.freshness || null,
      freshRequested: post.meta?.freshRequested === true,
      cachePolicy: post.meta?.cachePolicy || null,
      refreshFailed: post.meta?.refreshFailed === true,
      warmOk: warm.ok
    })
  } catch (error) {
    hardFailure = true
    console.error(`SCOPE_FAIL ${scope}: ${error?.message || error}`)
  }
}

console.log(JSON.stringify({ snapshotFreshness: freshness }))
if (hardFailure || after.size !== SCOPES.length) process.exit(2)

const beforeIndexes = new Map([...before].map(([scope, data]) => [scope, mapByMatricula(data.rows)]))
const afterIndexes = new Map([...after].map(([scope, data]) => [scope, mapByMatricula(data.rows)]))

const canonicalOwners = new Map()
const duplicateAcrossScopes = new Map()
for (const [scope, data] of after) {
  for (const row of data.rows) {
    const matricula = canonicalMatricula(row?.matricula)
    if (!matricula) continue
    if (!canonicalOwners.has(matricula)) canonicalOwners.set(matricula, { scope, row })
    else inc(duplicateAcrossScopes, `${canonicalOwners.get(matricula).scope}->${scope}`)
  }
}

const derivedTransitions = new Map()
const missingScope = new Map()
const lookupMisses = new Map()
const fieldDiffs = new Map()
const staleBeforeWarm = new Map()
let checked = 0
let exact = 0

for (const [matricula, canonical] of canonicalOwners) {
  checked += 1
  const prefixPlantel = normalizeSchoolPlantel(matricula)
  const derivedScope = scopeFor(prefixPlantel || matricula)
  inc(derivedTransitions, `${canonical.scope}->${derivedScope || 'NONE'}`)

  if (!derivedScope || !afterIndexes.has(derivedScope)) {
    inc(missingScope, `${canonical.scope}->${derivedScope || 'NONE'}`)
    continue
  }

  const actualRow = afterIndexes.get(derivedScope).map.get(matricula)
  if (!actualRow) {
    inc(lookupMisses, `${canonical.scope}->${derivedScope}`)
    continue
  }

  const expected = {
    plantel: canonical.scope,
    nivel: cleanAcademic(canonical.row?.nivel),
    grado: cleanAcademic(canonical.row?.grado),
    grupo: cleanAcademic(canonical.row?.grupo || canonical.row?.group)
  }
  const actual = placementFromRow(actualRow, ciclo)
  let rowDiff = false
  for (const key of ['plantel', 'nivel', 'grado', 'grupo']) {
    const left = cleanAcademic(expected[key])
    const right = cleanAcademic(actual?.[key])
    if (left !== right) {
      rowDiff = true
      inc(fieldDiffs, `${key}:${left || '(empty)'}->${right || '(empty)'}`)
    }
  }
  if (!rowDiff) exact += 1

  const preRow = beforeIndexes.get(derivedScope)?.map.get(matricula)
  if (!preRow) {
    inc(staleBeforeWarm, `${canonical.scope}:missing-before-warm`)
  } else {
    const pre = placementFromRow(preRow, ciclo)
    const post = placementFromRow(actualRow, ciclo)
    for (const key of ['plantel', 'nivel', 'grado', 'grupo']) {
      if (cleanAcademic(pre?.[key]) !== cleanAcademic(post?.[key])) {
        inc(staleBeforeWarm, `${canonical.scope}:${key}-changed-on-warm`)
      }
    }
  }
}

const summary = {
  checked,
  exact,
  failures: checked - exact,
  duplicateAcrossScopes: publicMap(duplicateAcrossScopes),
  derivedScopeTransitions: publicMap(derivedTransitions),
  missingDerivedScope: publicMap(missingScope),
  lookupMisses: publicMap(lookupMisses),
  fieldDiffs: publicMap(fieldDiffs),
  changedByWarm: publicMap(staleBeforeWarm)
}
console.log(JSON.stringify(summary))

const parityFailed = summary.failures > 0 || duplicateAcrossScopes.size > 0
if (parityFailed) {
  console.error('HUSKY_CRM_EXACT_STUDENT_PARITY_FAILED')
  process.exit(2)
}
console.log('HUSKY_CRM_EXACT_STUDENT_PARITY_OK')
