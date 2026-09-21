const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const TARGET_KEY = 'TRANSPORTE_SENCILLO_R6'
const TARGET_NAME = 'TRANSPORTE SENCILLO R6'
const CICLO = '2026-2027'
if (!TOKEN) process.exit(3)

const keyOf = (value) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')

async function get(path, params = {}) {
  const url = new URL(path, BASE + '/')
  for (const [key, value] of Object.entries(params)) if (value !== '') url.searchParams.set(key, String(value))
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'x-aurora-token': TOKEN, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(90000),
  })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  console.log('HTTP', response.status, url.pathname, url.search)
  if (!response.ok) {
    console.log(text.slice(0, 2000))
    process.exit(2)
  }
  return { data, response }
}

const metaResult = await get('/api/external/v1/talleres/meta', { ciclo: CICLO })
const meta = metaResult.data
const catalog = Array.isArray(meta?.catalog) ? meta.catalog : []
const r6Catalog = catalog.find(item => keyOf(item?.clave || item?.nombre) === TARGET_KEY)
console.log('R6_CATALOG', JSON.stringify(r6Catalog || null))
if (!r6Catalog) {
  console.error('FAIL: R6 missing from live Aurora v1 catalog')
  process.exit(10)
}

const rosterResult = await get('/api/external/v1/talleres/roster', { plantel: 'SM', ciclo: CICLO })
const roster = rosterResult.data
const sources = Array.isArray(roster?.meta?.sources) ? roster.meta.sources : []
console.log('SM_SOURCES', JSON.stringify(sources, null, 2))
if (!sources.length || sources.some(source => String(source?.freshness || '').toLowerCase() !== 'fresh')) {
  console.error('FAIL: SM snapshot is not verified fresh')
  process.exit(11)
}

const directMembers = roster?.data?.SM?.[TARGET_NAME] || []
const studentMembers = (Array.isArray(roster?.students) ? roster.students : []).filter(student =>
  (student?.asignaciones || student?.talleres || []).some(item => keyOf(item?.clave || item?.nombre || item) === TARGET_KEY)
)
const members = directMembers.length ? directMembers : studentMembers
console.log('R6_SM_MEMBER_COUNT', members.length)
console.log('R6_SM_MEMBERS', JSON.stringify(members.map(student => ({
  matricula: student?.matricula,
  nombre: student?.nombreCompleto || student?.fullName,
  plantel: student?.plantel,
  status: student?.status,
  baja: student?.baja,
})), null, 2))

if (!members.length) {
  console.error('FAIL: R6 exists in catalog but has no SM roster membership')
  process.exit(12)
}

console.log('R6_LIVE_OK', TARGET_KEY, 'catalog=1', 'smMembers=' + members.length)
