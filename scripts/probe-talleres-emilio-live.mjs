const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const Q = 'Lopez Rosas Emilio Alejandro'
if (!TOKEN) process.exit(3)

async function get(path, params = {}) {
  const url = new URL(path, BASE + '/')
  for (const [key, value] of Object.entries(params)) if (value !== '') url.searchParams.set(key, String(value))
  const response = await fetch(url, { headers: { Accept: 'application/json', 'x-aurora-token': TOKEN }, signal: AbortSignal.timeout(90000) })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  console.log('HTTP', response.status, url.pathname, url.search)
  if (!response.ok) {
    console.log(text.slice(0, 1000))
    process.exit(2)
  }
  return data
}

const search = await get('/api/external/v1/talleres/students/search', { q: Q, ciclo: '2026-2027' })
const matches = Array.isArray(search?.data) ? search.data : []
console.log('MATCHES', matches.length)
for (const student of matches) {
  console.log(JSON.stringify({
    matricula: student?.matricula,
    nombreCompleto: student?.nombreCompleto || student?.fullName,
    plantel: student?.plantel,
    baja: student?.baja,
    status: student?.status,
    servicios: student?.servicios,
    talleres: (student?.talleres || []).map(x => ({
      clave: x?.clave,
      nombre: x?.nombre,
      fuentes: x?.fuentes,
      conceptosFinancieros: (x?.conceptosFinancieros || []).map(c => ({
        conceptoId: c?.conceptoId,
        conceptoNombre: c?.conceptoNombre || c?.nombre,
      })),
      joined: x?.joined,
    })),
    asignaciones: (student?.asignaciones || []).map(x => ({
      clave: x?.clave,
      nombre: x?.nombre,
      fuentes: x?.fuentes,
      joined: x?.joined,
    })),
    joined: student?.joined,
    snapshotSourcePlanteles: student?.snapshotSourcePlanteles,
  }, null, 2))

  const roster = await get('/api/external/v1/talleres/roster', { plantel: student?.plantel || '', ciclo: '2026-2027' })
  const byMatricula = (roster?.students || []).find(x => String(x?.matricula || '').trim().toUpperCase() === String(student?.matricula || '').trim().toUpperCase())
  console.log('ROSTER_STUDENT', JSON.stringify({
    matricula: byMatricula?.matricula,
    nombreCompleto: byMatricula?.nombreCompleto || byMatricula?.fullName,
    plantel: byMatricula?.plantel,
    baja: byMatricula?.baja,
    status: byMatricula?.status,
    servicios: byMatricula?.servicios,
    asignaciones: (byMatricula?.asignaciones || []).map(x => ({ clave: x?.clave, nombre: x?.nombre, fuentes: x?.fuentes })),
  }, null, 2))
  const footballMembers = roster?.data?.[student?.plantel]?.FUTBOL || roster?.data?.[student?.plantel]?.FÚTBOL || []
  console.log('FUTBOL_MEMBER', footballMembers.some(x => String(x?.matricula || '').trim().toUpperCase() === String(student?.matricula || '').trim().toUpperCase()))
}
