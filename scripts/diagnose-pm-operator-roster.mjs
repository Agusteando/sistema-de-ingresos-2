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
  mostRecentlyUpdatedEnrolled: rows
    .filter((row) => row.updatedAt)
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 20)
    .map((row) => ({
      matricula: row.matricula,
      nombre: row.nombreCompleto || row.fullName || '',
      status: row.status,
      enrollmentState: row.enrollmentState,
      grado: row.grado,
      grupo: row.grupo || row.group,
      updatedAt: row.updatedAt
    })),
  enrolledButStatusBaja: anomalies.map((row) => ({
    matricula: row.matricula,
    nombre: row.nombreCompleto || row.fullName || '',
    status: row.status,
    baja: row.baja,
    statusSource: row.statusSource,
    enrollmentState: row.enrollmentState,
    grado: row.grado,
    grupo: row.grupo || row.group,
    basePlantel: row.basePlantel,
    cicloBase: row.cicloBase,
    updatedAt: row.updatedAt
  }))
}, null, 2))


const authHeaders = {
  Authorization: `Bearer ${token}`,
  'x-aurora-token': token,
  'x-api-key': token,
  Accept: 'application/json',
  'Cache-Control': 'no-cache'
}

const kpisUrl = new URL('https://aurora.casitaiedis.edu.mx/api/external/v1/control-escolar/kpis')
kpisUrl.searchParams.set('plantel', 'PM')
kpisUrl.searchParams.set('ciclo', '2026')
kpisUrl.searchParams.set('concepts', '878')
kpisUrl.searchParams.set('enrollmentConcepts', '878')

const kpisResponse = await fetch(kpisUrl, { headers: authHeaders })
console.log('EXTERNAL_KPIS', kpisResponse.status, await kpisResponse.text())

for (const row of anomalies) {
  const detailUrl = new URL(`https://aurora.casitaiedis.edu.mx/api/external/v1/control-escolar/students/${encodeURIComponent(row.matricula)}`)
  detailUrl.searchParams.set('plantel', 'PM')
  detailUrl.searchParams.set('ciclo', '2026')
  detailUrl.searchParams.set('concepts', '878')
  detailUrl.searchParams.set('enrollmentConcepts', '878')
  const detailResponse = await fetch(detailUrl, { headers: authHeaders })
  const detailText = await detailResponse.text()
  console.log('DETAIL', row.matricula, detailResponse.status, detailText)
}

// Runtime probe retriggered after main deployment of baja trace. retry 2


const auditUrl = new URL('https://aurora.casitaiedis.edu.mx/api/external/v1/control-escolar/ui-audit-latest')
auditUrl.searchParams.set('plantel', 'PM')
auditUrl.searchParams.set('ciclo', '2026')
const auditResponse = await fetch(auditUrl, { headers: authHeaders })
console.log('UI_AUDIT_LATEST', auditResponse.status, await auditResponse.text())
