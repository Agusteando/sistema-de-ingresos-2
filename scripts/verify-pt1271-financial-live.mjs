const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const MATRICULA = 'PT1271'
const PLANTEL = 'PT'
const CICLO = String(process.env.AURORA_TEST_CYCLE || '2026').trim()
const MAX_ATTEMPTS = Number(process.env.PT1271_MAX_ATTEMPTS || 24)
const WAIT_MS = Number(process.env.PT1271_WAIT_MS || 15000)

if (!TOKEN) throw new Error('AURORA_API_TOKEN is required')

const headers = { Accept: 'application/json', 'x-aurora-token': TOKEN }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clean = (value) => String(value ?? '').trim()
const key = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

const request = async (path) => {
  const response = await fetch(`${BASE}${path}`, {
    headers,
    signal: AbortSignal.timeout(120000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new Error(`${path} HTTP ${response.status}: ${payload?.message || payload?.error || 'unknown'}`)
  }
  return payload
}

let last = null
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    const search = await request(`/api/external/v1/talleres/students/search?plantel=${PLANTEL}&ciclo=${encodeURIComponent(CICLO)}&q=${MATRICULA}`)
    const student = (Array.isArray(search?.data) ? search.data : [])
      .find((row) => clean(row?.matricula).toUpperCase() === MATRICULA)
    const gimnasia = (Array.isArray(student?.asignaciones) ? student.asignaciones : [])
      .find((assignment) => key(assignment?.clave || assignment?.nombre) === 'GIMNASIA')
    const financialSource = Array.isArray(gimnasia?.fuentes) && gimnasia.fuentes.includes('concepto_financiero')
    const financialConcept = (Array.isArray(gimnasia?.conceptosFinancieros) ? gimnasia.conceptosFinancieros : [])
      .find((row) => key(row?.conceptoNombre || row?.documentoConceptoNombre) === 'GIMNASIA_RITMICA')

    const summary = await request(`/api/external/v1/talleres/summary?plantel=${PLANTEL}&ciclo=${encodeURIComponent(CICLO)}`)
    const summaryGroup = (Array.isArray(summary?.talleres) ? summary.talleres : [])
      .find((row) => key(row?.clave || row?.nombre) === 'GIMNASIA')
    const summaryMember = (Array.isArray(summaryGroup?.students) ? summaryGroup.students : [])
      .some((row) => clean(row?.matricula).toUpperCase() === MATRICULA)

    last = {
      attempt,
      studentFound: Boolean(student),
      gimnasiaFound: Boolean(gimnasia),
      financialSource: Boolean(financialSource),
      gimnasiaRitmicaEvidence: Boolean(financialConcept),
      summaryMember,
    }

    if (last.studentFound && last.gimnasiaFound && last.financialSource && last.gimnasiaRitmicaEvidence && last.summaryMember) {
      console.log(JSON.stringify({ ok: true, matricula: MATRICULA, plantel: PLANTEL, catalogKey: 'GIMNASIA', ...last }, null, 2))
      console.log('AURORA_PT1271_GIMNASIA_FINANCIAL_PARITY_OK')
      process.exit(0)
    }
  } catch (error) {
    last = { attempt, error: String(error?.message || error) }
  }

  if (attempt < MAX_ATTEMPTS) await sleep(WAIT_MS)
}

let diagnostics = null
try {
  diagnostics = await request(`/api/external/v1/talleres/diagnostics/student?plantel=${PLANTEL}&ciclo=${encodeURIComponent(CICLO)}&matricula=${MATRICULA}`)
} catch (error) {
  diagnostics = { error: String(error?.message || error) }
}
console.error(JSON.stringify({
  ok: false,
  matricula: MATRICULA,
  plantel: PLANTEL,
  expected: 'GIMNASIA via GIMNASIA RITMICA financial concept',
  last,
  diagnostics: diagnostics?.diagnostics || diagnostics,
}, null, 2))
throw new Error('PT1271 did not reach GIMNASIA financial parity in deployed Aurora')
