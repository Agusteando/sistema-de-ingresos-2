import { createHash } from 'node:crypto'

const BASE = 'https://aurora.casitaiedis.edu.mx'
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const PLANTELES = ['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST']
const EXPECTED_VIEW = 'control-escolar-student-view-v2-canonical'

if (!TOKEN) {
  console.error('AURORA_API_TOKEN missing')
  process.exit(3)
}

const clean = (value) => String(value ?? '').trim()
const normalizeMatricula = (value) => clean(value).toUpperCase().replace(/\s+/g, '')
const normalizeGrade = (value) => clean(value).toLocaleLowerCase('es') || 'sin grado'
const normalizeGroup = (value) => clean(value).toLocaleUpperCase('es') || 'SIN GRUPO'
const sortedObject = (map) => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })))
const hashSet = (values) => createHash('sha256').update([...new Set(values)].sort().join('\n')).digest('hex')
const count = (rows, keyFor) => {
  const map = new Map()
  for (const row of rows) {
    const key = keyFor(row)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return sortedObject(map)
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, BASE), {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': TOKEN,
      'user-agent': 'Aurora-Lista-Parity-Runtime/1.0'
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

async function readAll(plantel, ciclo, status = '') {
  const rows = []
  let cursor = ''
  let firstMeta = null
  let pages = 0
  do {
    const url = new URL('/api/external/v1/control-escolar/students', BASE)
    url.searchParams.set('plantel', plantel)
    url.searchParams.set('ciclo', ciclo)
    url.searchParams.set('fresh', '1')
    url.searchParams.set('limit', '500')
    if (status) url.searchParams.set('status', status)
    if (cursor) url.searchParams.set('cursor', cursor)
    const payload = await api(`${url.pathname}${url.search}`)
    if (!Array.isArray(payload?.data)) throw new Error(`${plantel}: public students response has no data[]`)
    firstMeta ||= payload?.meta || {}
    rows.push(...payload.data)
    cursor = clean(payload?.pagination?.nextCursor)
    pages += 1
    if (pages > 100) throw new Error(`${plantel}: pagination exceeded 100 pages`)
  } while (cursor)
  return { rows, meta: firstMeta || {}, pages }
}

const cyclePayload = await api('/api/external/v1/school-cycle')
const cycle = clean(cyclePayload?.currentCycle?.label || cyclePayload?.currentCycle?.key || cyclePayload?.ciclo)
if (!/^20\d{2}-20\d{2}$/.test(cycle)) throw new Error(`Invalid cycle from Aurora: ${cycle || '(empty)'}`)
console.log(`cycle=${cycle}`)

let failed = false
for (const plantel of PLANTELES) {
  try {
    const warmed = await api('/api/external/v1/control-escolar/warm', { method: 'POST', body: { plantel, ciclo: cycle } })
    const warmResult = Array.isArray(warmed?.results) ? warmed.results.find((row) => clean(row?.plantel) === plantel) || warmed.results[0] : null
    if (!warmResult) throw new Error(`${plantel}: warm returned no result`)

    const all = await readAll(plantel, cycle)
    const enrolled = await readAll(plantel, cycle, 'inscrito')
    const warmRows = Number(warmResult?.rows)
    if (!Number.isFinite(warmRows)) throw new Error(`${plantel}: warm row count missing`)
    if (all.rows.length !== warmRows) throw new Error(`${plantel}: persisted total ${all.rows.length} != canonical warm total ${warmRows}`)
    if (clean(all.meta?.viewVersion) !== EXPECTED_VIEW) throw new Error(`${plantel}: viewVersion=${clean(all.meta?.viewVersion) || '(empty)'}`)
    if (clean(enrolled.meta?.viewVersion) !== EXPECTED_VIEW) throw new Error(`${plantel}: enrolled viewVersion=${clean(enrolled.meta?.viewVersion) || '(empty)'}`)
    if (clean(all.meta?.groupSource).toLowerCase() === 'matricula.grupo-live' || clean(enrolled.meta?.groupSource).toLowerCase() === 'matricula.grupo-live') {
      throw new Error(`${plantel}: legacy matricula.grupo overlay is still active`)
    }

    const invalidEnrolled = enrolled.rows.filter((row) => {
      const state = clean(row?.enrollmentState).toLowerCase()
      return state !== 'inscrito' || !normalizeMatricula(row?.matricula || row?.studentId) || !clean(row?.nombreCompleto || row?.fullName) || !clean(row?.grado) || !clean(row?.grupo || row?.group)
    })
    if (invalidEnrolled.length) throw new Error(`${plantel}: ${invalidEnrolled.length} enrolled rows fail Lista contract fields`)

    const matriculas = enrolled.rows.map((row) => normalizeMatricula(row?.matricula || row?.studentId)).filter(Boolean)
    if (new Set(matriculas).size !== matriculas.length) throw new Error(`${plantel}: duplicate matriculas in enrolled roster`)

    console.log(JSON.stringify({
      plantel,
      canonicalWarmTotal: warmRows,
      externalTotal: all.rows.length,
      enrolledTotal: enrolled.rows.length,
      enrolledMatriculaSetSha256: hashSet(matriculas),
      gradeCounts: count(enrolled.rows, (row) => normalizeGrade(row?.grado)),
      gradeGroupCounts: count(enrolled.rows, (row) => `${normalizeGrade(row?.grado)} / ${normalizeGroup(row?.grupo || row?.group)}`),
      viewVersion: all.meta?.viewVersion || null,
      pages: { all: all.pages, enrolled: enrolled.pages }
    }))
  } catch (error) {
    failed = true
    console.error(`FAIL ${plantel}: ${error?.message || error}`)
  }
}
if (failed) process.exit(2)
console.log('RUNTIME_PARITY_CONTRACT_OK')
