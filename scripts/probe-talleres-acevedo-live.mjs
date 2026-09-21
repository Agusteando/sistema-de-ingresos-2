const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const CYCLE = '2026-2027'
const TARGET = 'Acevedo Miranda Luis Fernando'
if (!TOKEN) throw new Error('AURORA_API_TOKEN missing')

const request = async (label, path) => {
  const started = Date.now()
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'x-aurora-token': TOKEN },
    signal: AbortSignal.timeout(90000),
  })
  const payload = await response.json().catch(() => ({}))
  console.log(`${label} HTTP=${response.status} ms=${Date.now()-started}`)
  if (!response.ok) {
    console.log(JSON.stringify(payload))
    throw new Error(`${label} failed`)
  }
  return payload
}

const search = await request('SEARCH', `/api/external/v1/talleres/students/search?plantel=SM&ciclo=${encodeURIComponent(CYCLE)}&q=${encodeURIComponent(TARGET)}`)
const rows = Array.isArray(search?.data) ? search.data : []
const match = rows.find(row => String(row?.nombreCompleto || row?.fullName || '').toLowerCase().includes('acevedo miranda luis fernando'))
console.log('ACEVEDO_SEARCH='+JSON.stringify(match || null))

const roster = await request('ROSTER_SM', `/api/external/v1/talleres/roster?plantel=SM&ciclo=${encodeURIComponent(CYCLE)}`)
const students = Array.isArray(roster?.students) ? roster.students : []
const rosterMatch = students.find(row => String(row?.nombreCompleto || row?.fullName || '').toLowerCase().includes('acevedo miranda luis fernando'))
console.log('ACEVEDO_ROSTER='+JSON.stringify(rosterMatch || null))
const entries = Object.entries(roster?.data?.SM || {})
const futbolEntry = entries.find(([name]) => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes('FUTBOL'))
const futbol = Array.isArray(futbolEntry?.[1]) ? futbolEntry[1] : []
const futbolMatch = futbol.find(row => String(row?.nombreCompleto || row?.fullName || '').toLowerCase().includes('acevedo miranda luis fernando'))
console.log('ACEVEDO_FUTBOL='+JSON.stringify(futbolMatch || null))
console.log('SM_SOURCE='+JSON.stringify((roster?.meta?.sources || []).find(source => String(source?.plantel || '').toUpperCase()==='SM') || null))
console.log('CATALOG_FUTBOL='+JSON.stringify((roster?.catalog || []).find(item => String(item?.clave || item?.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes('FUTBOL')) || null))

if (!match || !rosterMatch || !futbolMatch) {
  throw new Error('Acevedo must exist in Aurora SM/FUTBOL ground truth')
}
console.log('ACEVEDO_SM_FUTBOL_GROUNDTRUTH_OK')
