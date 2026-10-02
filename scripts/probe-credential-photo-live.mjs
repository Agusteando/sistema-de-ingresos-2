const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const REQUESTED_CYCLE = String(process.env.AURORA_TEST_CYCLE || '').trim()
const STAGE = String(process.env.AURORA_CREDENTIAL_STAGE || '1').trim()

if (!TOKEN) {
  console.error('AURORA_API_TOKEN is not available to this Actions run.')
  process.exit(3)
}

const PLANTELES = ['PREEM','PREET','GM','PM','PT','SM','ST']
const failures = []
const clean = (value, max=160) => String(value ?? '').trim().slice(0,max)

function target(path, params={}) {
  const url=new URL(path, BASE + '/')
  for (const [key,value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') {
    url.searchParams.set(key,String(value))
  }
  return url
}

async function get(name,path,params={}) {
  const started=Date.now()
  try {
    const response=await fetch(target(path,params),{
      headers:{Accept:'application/json','x-api-key':TOKEN,'User-Agent':'Aurora-Credential-Stage-Gate/1.0'},
      signal:AbortSignal.timeout(45000)
    })
    const text=await response.text()
    let data=null
    try { data=text ? JSON.parse(text) : null } catch {}
    const code=clean(data?.data?.code || data?.code || data?.statusMessage || '')
    console.log(`${name}: HTTP ${response.status} ${Date.now()-started}ms${code ? ` code=${code}` : ''}`)
    if (!response.ok) failures.push({name,status:response.status,code})
    return {ok:response.ok,status:response.status,data}
  } catch (error) {
    const code=clean(error?.name || 'TRANSPORT_ERROR')
    console.log(`${name}: ERROR ${code} ${Date.now()-started}ms`)
    failures.push({name,status:0,code})
    return {ok:false,status:0,data:null}
  }
}

const cycleResponse=await get('school-cycle','/api/external/v1/school-cycle')
const cycle=REQUESTED_CYCLE || clean(
  cycleResponse.data?.currentCycle?.label ||
  cycleResponse.data?.currentCycle?.key ||
  cycleResponse.data?.ciclo
)
if (!cycle) {
  console.error('Could not determine an academic cycle.')
  process.exit(4)
}
console.log(`cycle=${cycle} stage=${STAGE}`)

await get('control-escolar/health','/api/external/v1/control-escolar/health')
await get('control-escolar/auth/diagnostics','/api/external/v1/control-escolar/auth/diagnostics')

for (const plantel of PLANTELES) {
  const students=await get(`CE ${plantel} students`,'/api/external/v1/control-escolar/students',{
    plantel,ciclo:cycle,status:'inscrito',limit:1
  })
  if (students.ok && !Array.isArray(students.data?.data)) {
    failures.push({name:`CE ${plantel} students shape`,status:students.status,code:'INVALID_DATA_SHAPE'})
  }

  const photos=await get(`CE ${plantel} credential photos`,'/api/external/v1/control-escolar/credential-photos',{
    plantel,ciclo:cycle,stage:STAGE
  })
  if (photos.ok) {
    const contract=clean(photos.data?.contract)
    if (contract !== 'credential-photo-stages-v2') {
      console.log(`CE ${plantel} credential photos: invalid contract=${contract || '-'}`)
      failures.push({name:`CE ${plantel} credential photos contract`,status:photos.status,code:contract || 'MISSING_CONTRACT'})
    }
  }
}

console.log(`SUMMARY checks=${2 + (PLANTELES.length*2) + 1} failures=${failures.length}`)
if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure.name} HTTP=${failure.status} code=${failure.code || '-'}`)
  process.exit(2)
}
