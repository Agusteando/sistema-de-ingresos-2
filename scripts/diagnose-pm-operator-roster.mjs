const token = String(process.env.AURORA_API_TOKEN || '').trim()
if (!token) {
  console.error('AURORA_API_TOKEN missing')
  process.exit(3)
}

const url = new URL('https://aurora.casitaiedis.edu.mx/api/external/v1/control-escolar/operator-roster')
url.searchParams.set('plantel', 'PM')
url.searchParams.set('ciclo', '2026')

const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    'x-aurora-token': token,
    'x-api-key': token,
    Accept: 'application/json',
    'Cache-Control': 'no-cache'
  }
})

if (!response.ok) {
  console.error('HTTP', response.status, await response.text())
  process.exit(2)
}

const payload = await response.json()
const rows = Array.isArray(payload?.data) ? payload.data : []
const normalized = (value) => String(value ?? '').trim().toLowerCase()
const anomalies = rows.filter((row) =>
  normalized(row?.enrollmentState) === 'inscrito' &&
  normalized(row?.status) === 'baja'
)

const countsByStatus = rows.reduce((acc, row) => {
  const key = String(row?.status || 'SIN_STATUS').trim() || 'SIN_STATUS'
  acc[key] = (acc[key] || 0) + 1
  return acc
}, {})

const countsByGrade = rows.reduce((acc, row) => {
  const key = String(row?.grado || 'SIN_GRADO').trim() || 'SIN_GRADO'
  acc[key] = (acc[key] || 0) + 1
  return acc
}, {})

console.log(JSON.stringify({
  meta: payload?.meta || null,
  rowCount: rows.length,
  countsByStatus,
  countsByGrade,
  enrolledButStatusBajaCount: anomalies.length,
  enrolledButStatusBaja: anomalies.map((row) => ({
    matricula: row.matricula,
    nombre: row.nombreCompleto || row.fullName || '',
    status: row.status,
    enrollmentState: row.enrollmentState,
    grado: row.grado,
    grupo: row.grupo || row.group,
    basePlantel: row.basePlantel,
    cicloBase: row.cicloBase
  }))
}, null, 2))
