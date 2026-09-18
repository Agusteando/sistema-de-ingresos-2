const BASE = 'https://aurora.casitaiedis.edu.mx'
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const PLANTELES = ['PREEM', 'PREET', 'PM', 'PT', 'SM', 'ST']

if (!TOKEN) {
  console.error('AURORA_API_TOKEN missing')
  process.exit(3)
}

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max)
const normalizePlantel = (value) => clean(value, 80).toUpperCase()
const normalizeGroup = (value) => clean(value, 80).toUpperCase()
const normalizeRosterPlantel = (value, fallback) => {
  const raw = normalizePlantel(value || fallback)
  if (raw === 'CT') return 'PREET'
  if (raw === 'CM' || raw === 'DM') return 'PREEM'
  if (raw === 'PMA' || raw === 'PMB') return 'PM'
  return raw
}
const normalizeRosterGrade = (value) => {
  const raw = clean(value, 80)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, '')
    .trim()
  const map = {
    '1': 'primero', '01': 'primero', primer: 'primero', primero: 'primero',
    '2': 'segundo', '02': 'segundo', segundo: 'segundo',
    '3': 'tercero', '03': 'tercero', tercer: 'tercero', tercero: 'tercero',
    '4': 'cuarto', '04': 'cuarto', cuarto: 'cuarto',
    '5': 'quinto', '05': 'quinto', quinto: 'quinto',
    '6': 'sexto', '06': 'sexto', sexto: 'sexto'
  }
  return map[raw] || raw
}
const studentName = (row) => {
  const direct = clean(row?.fullName || row?.nombreCompleto, 255)
  if (direct) return direct.replace(/\s+/g, ' ')
  return [row?.apellidoPaterno, row?.apellidoMaterno, row?.nombres]
    .map((value) => clean(value, 120))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const bucketKey = (row) => `${normalizeRosterGrade(row?.grado)} / ${normalizeGroup(row?.grupo ?? row?.group)}`
const countBuckets = (rows) => {
  const map = new Map()
  for (const row of rows) {
    const key = bucketKey(row)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}
const countGrades = (rows) => {
  const map = new Map()
  for (const row of rows) {
    const key = normalizeRosterGrade(row?.grado)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}
const diffMaps = (expected, actual) => [...new Set([...expected.keys(), ...actual.keys()])]
  .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
  .map((key) => ({ bucket: key, aurora: expected.get(key) || 0, lista: actual.get(key) || 0 }))
  .filter((row) => row.aurora !== row.lista)

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, BASE), {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': TOKEN,
      authorization: `Bearer ${TOKEN}`,
      'user-agent': 'Aurora-Lista-Exact-Parity/1.0'
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

async function readAll(plantel, ciclo, { fresh = false } = {}) {
  const rows = []
  let cursor = ''
  let meta = null
  do {
    const url = new URL('/api/external/v1/control-escolar/students', BASE)
    url.searchParams.set('plantel', plantel)
    url.searchParams.set('ciclo', ciclo)
    url.searchParams.set('status', 'inscrito')
    url.searchParams.set('limit', '500')
    if (fresh) url.searchParams.set('fresh', '1')
    if (cursor) url.searchParams.set('cursor', cursor)
    const payload = await api(`${url.pathname}${url.search}`)
    if (!Array.isArray(payload?.data)) throw new Error(`${plantel}: response missing data[]`)
    meta ||= payload?.meta || {}
    rows.push(...payload.data)
    cursor = clean(payload?.pagination?.nextCursor, 500)
  } while (cursor)
  return { rows, meta: meta || {} }
}

function applyListaTransform(rows, requestedPlantel) {
  const students = []
  const rejectionReasons = new Map()
  const sourcePlantelMismatches = new Map()
  for (const row of rows) {
    const sourcePlantel = normalizeRosterPlantel(row?.plantel || row?.basePlantel, requestedPlantel)
    const grado = normalizeRosterGrade(row?.grado)
    const grupo = normalizeGroup(row?.grupo || row?.group)
    const nombre = studentName(row)
    let reason = ''
    if (!nombre) reason = 'nombre vacío'
    else if (!grado) reason = 'grado vacío'
    else if (!grupo) reason = 'grupo vacío'
    if (reason) {
      rejectionReasons.set(reason, (rejectionReasons.get(reason) || 0) + 1)
      continue
    }
    if (sourcePlantel && sourcePlantel !== requestedPlantel) {
      const key = `${sourcePlantel}->${requestedPlantel}`
      sourcePlantelMismatches.set(key, (sourcePlantelMismatches.get(key) || 0) + 1)
    }
    students.push({ grado, grupo, plantel: requestedPlantel })
  }
  return {
    students,
    rejections: Object.fromEntries([...rejectionReasons.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))),
    sourcePlantelMismatches: Object.fromEntries([...sourcePlantelMismatches.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')))
  }
}


function applyAttendanceReportCurrentTransform(rows, requestedPlantel) {
  const students = []
  const rejections = new Map()
  const reject = (reason) => rejections.set(reason, (rejections.get(reason) || 0) + 1)
  for (const row of rows) {
    const rawPlantel = normalizeRosterPlantel(row?.plantel || row?.basePlantel, '')
    const grado = clean(row?.grado, 80)
    const grupo = clean(row?.grupo ?? row?.group, 80)
    const nombre = studentName(row)
    const matricula = clean(row?.matricula || row?.id || row?.studentId || row?.student_id, 80)
    const enrollmentState = clean(row?.enrollmentState || row?.estadoInscripcion || row?.inscripcionEstado || row?.estadoIngreso || row?.tipoIngresoValue || row?.tipoIngreso, 120)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_')
    const status = clean(row?.status || row?.estatus || row?.estado, 120)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

    if (rawPlantel && rawPlantel !== requestedPlantel) { reject(`plantel ${rawPlantel}->${requestedPlantel}`); continue }
    if (!matricula) { reject('matricula vacia'); continue }
    if (!nombre) { reject('nombre vacio'); continue }
    if (enrollmentState !== 'inscrito' || status.includes('baja')) { reject(`estado local ${enrollmentState || '(vacio)'}/${status || '(vacio)'}`); continue }
    students.push({ grado, grupo, plantel: requestedPlantel })
  }
  return { students, rejections: Object.fromEntries([...rejections.entries()].sort(([a],[b]) => a.localeCompare(b,'es'))) }
}

const cyclePayload = await api('/api/external/v1/school-cycle')
const cycleLabel = clean(cyclePayload?.currentCycle?.label || cyclePayload?.currentCycle?.key || cyclePayload?.ciclo)
const cycleKey = cycleLabel.match(/\d{4}/)?.[0] || cycleLabel
console.log(JSON.stringify({ cycleLabel, listaCycleKey: cycleKey }))

let failed = false
for (const plantel of PLANTELES) {
  try {
    await api('/api/external/v1/control-escolar/warm', { method: 'POST', body: { plantel, ciclo: cycleLabel } })

    const canonical = await readAll(plantel, cycleLabel, { fresh: true })
    // Mirrors Lista after the fix: the requested endpoint scope owns membership;
    // row-level plantel/basePlantel is retained only as source metadata.
    const listaSource = await readAll(plantel, cycleKey, { fresh: false })
    const transformed = applyListaTransform(listaSource.rows, plantel)
    const attendanceCurrent = applyAttendanceReportCurrentTransform(listaSource.rows, plantel)

    const expectedBuckets = countBuckets(canonical.rows)
    const listaBuckets = countBuckets(transformed.students)
    const reportBuckets = countBuckets(attendanceCurrent.students)
    const expectedGrades = countGrades(canonical.rows)
    const listaGrades = countGrades(transformed.students)
    const reportGrades = countGrades(attendanceCurrent.students)
    const listaBucketDiffs = diffMaps(expectedBuckets, listaBuckets)
    const listaGradeDiffs = diffMaps(expectedGrades, listaGrades)
    const reportBucketDiffs = diffMaps(expectedBuckets, reportBuckets)
    const reportGradeDiffs = diffMaps(expectedGrades, reportGrades)
    const result = {
      plantel,
      auroraTotal: canonical.rows.length,
      listaTotal: transformed.students.length,
      attendanceReportCurrentTotal: attendanceCurrent.students.length,
      reportRejections: attendanceCurrent.rejections,
      listaGradeDiffs,
      listaBucketDiffs,
      reportGradeDiffs,
      reportBucketDiffs
    }
    console.log(JSON.stringify(result))
    if (canonical.rows.length !== transformed.students.length || listaGradeDiffs.length || listaBucketDiffs.length) {
      console.error(`Lista parity unexpectedly failed for ${plantel}`)
      failed = true
    }
    if (canonical.rows.length !== attendanceCurrent.students.length || reportGradeDiffs.length || reportBucketDiffs.length) failed = true
  } catch (error) {
    failed = true
    console.error(`FAIL ${plantel}: ${error?.message || error}`)
  }
}

if (failed) process.exit(2)
console.log('ATTENDANCE_REPORT_CURRENT_PARITY_OK')
