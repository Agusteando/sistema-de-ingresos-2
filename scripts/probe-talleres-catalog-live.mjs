const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(process.env.AURORA_API_TOKEN || '').trim()
const CYCLE = '2026-2027'
if (!TOKEN) throw new Error('AURORA_API_TOKEN missing')
const headers = { Accept:'application/json', 'x-aurora-token': TOKEN }
const normalize = (v) => String(v || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')

const get = async (path) => {
  const started=Date.now()
  const response=await fetch(`${BASE}${path}`,{headers,signal:AbortSignal.timeout(90000)})
  const payload=await response.json().catch(()=>({}))
  console.log(`HTTP ${response.status} ${Date.now()-started}ms ${path}`)
  if(!response.ok) throw new Error(JSON.stringify(payload))
  return payload
}

const meta=await get(`/api/external/v1/talleres/meta?ciclo=${encodeURIComponent(CYCLE)}`)
const catalog=Array.isArray(meta?.catalog)?meta.catalog:[]
const keys=new Map(catalog.map(item=>[normalize(item?.clave||item?.nombre),item]))
console.log('CATALOG_COUNT='+catalog.length)
console.log('CATALOG='+JSON.stringify(catalog.map(item=>({clave:item?.clave,nombre:item?.nombre,tipo:item?.tipo,orden:item?.orden}))))
const transport=catalog.filter(item=>normalize(item?.clave||item?.nombre).includes('TRANSPORTE'))
console.log('TRANSPORTE_CATALOG='+JSON.stringify(transport))
const target=keys.get('TRANSPORTE_SENCILLO_R6')
console.log('TRANSPORTE_SENCILLO_R6_META='+JSON.stringify(target||null))

const planteles=['PM','PT','SM','ST','PREEM','CT','GM','CO','DC']
const perCampus=[]
for(const plantel of planteles){
  const roster=await get(`/api/external/v1/talleres/roster?plantel=${plantel}&ciclo=${encodeURIComponent(CYCLE)}`)
  const services=roster?.data?.[plantel]||{}
  const byKey=new Map(Object.entries(services).map(([name,members])=>[normalize(name),{name,members:Array.isArray(members)?members:[]}]))
  const present=byKey.get('TRANSPORTE_SENCILLO_R6')
  const transportRows=[...byKey.entries()].filter(([key])=>key.includes('TRANSPORTE')).map(([key,row])=>({key,name:row.name,count:row.members.length}))
  perCampus.push({
    plantel,
    targetCount: present?.members?.length || 0,
    targetPresentAsDataKey: Boolean(present),
    transport: transportRows,
    source:(roster?.meta?.sources||[]).find(source=>String(source?.plantel||'').toUpperCase()===plantel)||null,
  })
}
console.log('TRANSPORTE_BY_CAMPUS='+JSON.stringify(perCampus))

if(!target) throw new Error('TRANSPORTE SENCILLO R6 is missing from active Aurora catalog')
console.log('TRANSPORTE_SENCILLO_R6_AURORA_CATALOG_OK')
