const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
if (!TOKEN) {
  console.error('AURORA_API_TOKEN is required for the Buscador live source gate.')
  process.exit(3)
}

const PLANTELES = ['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST']
const failures = []
const checks = []
let familyDataAssertions = 0
let scopedSearchAssertions = 0
const clean = (value, max = 255) => String(value ?? '').trim().slice(0, max)

function target(path, params = {}) {
  const url = new URL(path, BASE + '/')
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function get(path, params = {}) {
  const response = await fetch(target(path, params), {
    headers: {
      Accept: 'application/json',
      'x-api-key': TOKEN,
      'User-Agent': 'Aurora-Buscador-Live-Source-Gate/2.0'
    },
    signal: AbortSignal.timeout(60000)
  })
  const raw = await response.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + clean(data?.message || raw, 300))
  return data
}

function familyCandidate(student) {
  const sources = [
    ['father', student?.fatherName],
    ['mother', student?.motherName],
    ['father', student?.padre?.nombreCompleto],
    ['mother', student?.madre?.nombreCompleto],
    ['guardian', student?.guardianName],
    ['contact', student?.contactoPrincipal?.nombre]
  ]
  for (const [source, value] of sources) {
    const name = clean(value)
    if (!name) continue
    const parts = name
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}\p{N}-]/gu, ''))
      .filter((part) => part.length >= 4)
    if (parts.length) return { source, name, q: parts[parts.length - 1] }
  }
  return null
}

const cyclePayload = await get('/api/external/v1/school-cycle')
const cycle = clean(cyclePayload?.currentCycle?.key || cyclePayload?.currentCycle?.label || cyclePayload?.ciclo)
if (!cycle) throw new Error('Could not resolve the current school cycle.')

console.log('BUSCADOR_LIVE_SOURCE cycle=' + cycle)

for (const plantel of PLANTELES) {
  try {
    const roster = await get('/api/external/v1/control-escolar/students', {
      plantel,
      ciclo: cycle,
      status: 'inscrito',
      limit: 500
    })
    const rows = Array.isArray(roster?.data) ? roster.data : []
    const sample = rows.find((row) => clean(row?.matricula || row?.studentId) && familyCandidate(row)?.q)
      || rows.find((row) => clean(row?.matricula || row?.studentId))

    if (!sample) {
      checks.push({ plantel, result: 'empty-scope' })
      console.log('SKIP ' + plantel + ' no enrolled sample')
      continue
    }

    const matricula = clean(sample.matricula || sample.studentId, 64)
    const detail = await get('/api/external/v1/control-escolar/students/' + encodeURIComponent(matricula), {
      plantel,
      ciclo: cycle
    })
    const profile = detail?.data || detail
    if (clean(profile?.matricula || profile?.studentId, 64).toUpperCase() !== matricula.toUpperCase()) {
      throw new Error('detail matricula mismatch for ' + matricula)
    }

    const scopedSearch = await get('/api/external/v1/control-escolar/students', {
      plantel,
      ciclo: cycle,
      q: matricula,
      limit: 50
    })
    const scopedMatches = Array.isArray(scopedSearch?.data) ? scopedSearch.data : []
    const scopedFound = scopedMatches.some((row) =>
      clean(row?.matricula || row?.studentId, 64).toUpperCase() === matricula.toUpperCase()
    )
    if (!scopedFound) throw new Error('canonical scoped search did not return sample ' + matricula)
    scopedSearchAssertions += 1

    const family = familyCandidate(profile) || familyCandidate(sample)
    if (family?.q) {
      familyDataAssertions += 1
      checks.push({
        plantel,
        matricula,
        familySource: family.source,
        familyName: family.name,
        queryToken: family.q,
        result: 'canonical-family-source-ok'
      })
      console.log('PASS ' + plantel + ' family-source=' + family.source + ' matricula=' + matricula + ' name=' + family.name)
    } else {
      checks.push({ plantel, matricula, result: 'profile-ok-no-family-data' })
      console.log('INFO ' + plantel + ' profile=' + matricula + ' has no family name in the current live sample')
    }
  } catch (error) {
    failures.push({ plantel, error: clean(error?.message || error, 500) })
    console.log('FAIL ' + plantel + ' ' + clean(error?.message || error, 500))
  }
}

console.log(
  'BUSCADOR_LIVE_SOURCE_SUMMARY checks=' + checks.length +
  ' familyDataAssertions=' + familyDataAssertions +
  ' scopedSearchAssertions=' + scopedSearchAssertions +
  ' failures=' + failures.length
)

if (failures.length) {
  console.error(JSON.stringify({ failures, checks }, null, 2))
  process.exit(2)
}
if (scopedSearchAssertions < 4) {
  console.error('BUSCADOR_LIVE_SOURCE_SCOPE_INSUFFICIENT: too few live plantel-scoped samples were verified.')
  process.exit(4)
}
if (familyDataAssertions < 3) {
  console.error('BUSCADOR_LIVE_SOURCE_FAMILY_INSUFFICIENT: live source did not expose enough parent/tutor names to prove the family-name source.')
  process.exit(5)
}

console.log('BUSCADOR_LIVE_SOURCE_OK')
