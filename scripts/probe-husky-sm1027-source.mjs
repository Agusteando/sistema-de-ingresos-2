import assert from 'node:assert/strict'

const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const MATRICULA = 'SM1027'
const PLANTEL = 'SM'
const CICLO = '2026'

assert.ok(TOKEN, 'AURORA_API_TOKEN is required')

const clean = value => String(value ?? '').trim()

async function get(path) {
  const url = new URL(path, BASE + '/')
  url.searchParams.set('plantel', PLANTEL)
  url.searchParams.set('ciclo', CICLO)
  url.searchParams.set('fresh', '1')
  url.searchParams.set('cache', 'bypass')
  url.searchParams.set('_huskyFresh', String(Date.now()))
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'x-aurora-token': TOKEN,
      'x-api-key': TOKEN,
      Accept: 'application/json',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      Pragma: 'no-cache'
    }
  })
  const payload = await res.json().catch(() => null)
  assert.ok(res.ok, `${url.pathname} HTTP ${res.status}: ${clean(payload?.message || payload?.error)}`)
  return payload
}

const detail = await get(`/api/external/v1/control-escolar/students/${MATRICULA}`)
const academic = await get(`/api/external/v1/control-escolar/academic/${MATRICULA}`)

const d = detail?.data || {}
const a = academic?.data || {}
const name = clean(d.fullName || d.nombreCompleto || d.display?.nombre)
const plantel = clean(a.plantel || d.plantel).toUpperCase()
const nivel = clean(a.nivel || d.nivel)
const grado = clean(a.grado || d.grado)
const grupo = clean(a.grupo || a.group || d.grupo || d.group)

assert.equal(clean(d.matricula).toUpperCase(), MATRICULA, 'detail returned another matricula')
assert.equal(clean(a.matricula).toUpperCase(), MATRICULA, 'academic returned another matricula')
assert.equal(plantel, PLANTEL, 'plantel mismatch')
assert.ok(name, 'student name is empty in Aurora')
assert.ok(nivel, 'nivel is empty in Aurora')
assert.ok(grado, 'grado is empty in Aurora')
assert.ok(grupo, 'grupo is empty in Aurora')

assert.equal(clean(a.nivel), clean(d.nivel), 'detail/academic nivel mismatch')
assert.equal(clean(a.grado), clean(d.grado), 'detail/academic grado mismatch')
assert.equal(clean(a.grupo || a.group), clean(d.grupo || d.group), 'detail/academic grupo mismatch')

console.log(JSON.stringify({
  contract: 'AURORA_SM1027_HUSKY_SOURCE_OK',
  matricula: MATRICULA,
  plantel,
  hasName: Boolean(name),
  hasNivel: Boolean(nivel),
  hasGrado: Boolean(grado),
  hasGrupo: Boolean(grupo),
  hasCurp: Boolean(clean(d.curp)),
  hasServicio: Boolean(clean(d.servicio)),
  cachePolicy: clean(detail?.meta?.cachePolicy),
  source: clean(detail?.meta?.source),
  freshness: clean(detail?.meta?.freshness)
}))
