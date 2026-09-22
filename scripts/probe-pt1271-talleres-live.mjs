const base='https://aurora.casitaiedis.edu.mx'
const token=String(process.env.AURORA_API_TOKEN||'').trim()
if(!token) throw new Error('AURORA_API_TOKEN missing')
const headers={Accept:'application/json','x-aurora-token':token}
const matricula='PT1271'
const plantel='PT'
const ciclo='2026'
const req=async(path)=>{const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(120000)});const p=await r.json().catch(()=>({}));if(!r.ok) throw new Error(`${path} HTTP ${r.status}`);return p}
const search=await req(`/api/external/v1/talleres/students/search?plantel=${plantel}&ciclo=${ciclo}&q=${matricula}`)
const student=(Array.isArray(search?.data)?search.data:[]).find(x=>String(x?.matricula||'').trim().toUpperCase()===matricula)
const summary=await req(`/api/external/v1/talleres/summary?plantel=${plantel}&ciclo=${ciclo}`)
const memberships=(Array.isArray(summary?.talleres)?summary.talleres:[]).filter(t=>(Array.isArray(t?.students)?t.students:[]).some(s=>String(s?.matricula||'').trim().toUpperCase()===matricula)).map(t=>({clave:t.clave,nombre:t.nombre}))
console.log(JSON.stringify({matricula,found:Boolean(student),student:student?{nombre:student.nombreCompleto||student.fullName,servicios:student.servicios,asignaciones:student.asignaciones,talleres:student.talleres}:null,memberships},null,2))
if(!student) throw new Error('PT1271 missing from Talleres student search')
console.log('PT1271_TALLERES_LIVE_PROBE_OK')