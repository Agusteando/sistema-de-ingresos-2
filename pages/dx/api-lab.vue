<template>
  <main class="integrations">
    <header class="header">
      <div class="identity">
        <span class="mark">A</span>
        <div><h1>Integraciones</h1><span class="subtitle">Aurora / DX</span></div>
      </div>
      <div class="filters">
        <label>Plantel <select v-model="plantel" @change="refresh"><option v-for="p in planteles" :key="p" :value="p">{{ p }}</option></select></label>
        <label>Ciclo <input v-model.trim="cycle" @change="refresh" aria-label="Ciclo escolar" /></label>
        <button class="refresh" :disabled="loading" @click="refresh" :aria-label="loading ? 'Consultando' : 'Actualizar'"><span :class="{ spinning: loading }">↻</span> {{ loading ? 'Consultando' : 'Actualizar' }}</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="switch" role="tablist" aria-label="Vista">
        <button :class="{ active: view === 'apps' }" role="tab" :aria-selected="view === 'apps'" @click="view = 'apps'">Aplicaciones</button>
        <button :class="{ active: view === 'apis' }" role="tab" :aria-selected="view === 'apis'" @click="view = 'apis'">APIs</button>
      </div>
      <input v-model="search" class="search" placeholder="Buscar aplicación o API…" aria-label="Buscar integraciones" />
      <span class="measured" :title="observedAt ? 'Momento de consulta DX; no equivale al último uso de otras aplicaciones' : ''">{{ observedAt ? 'Datos ' + dateTime(observedAt) : 'Sin medición' }}</span>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="table-shell">
      <table class="overview" v-if="view === 'apps'">
        <thead><tr>
          <th>Aplicación</th><th>Datos de Aurora</th><th>Uso</th><th class="numeric">Alumnos API</th>
          <th class="numeric">Grupos API</th><th class="numeric">Sin grupo</th><th>Origen</th><th>Último uso</th>
        </tr></thead>
        <tbody>
          <tr v-for="item in filteredConsumers" :key="item.id" :class="{ picked: selectedConsumer === item.id }" @click="pickConsumer(item)" tabindex="0" @keydown.enter="pickConsumer(item)">
            <td class="app">{{ item.app }}</td>
            <td>{{ dataset(item.dataset)?.label || item.dataset }}</td>
            <td class="muted">{{ item.consumption }}</td>
            <td class="numeric metric">{{ number(stat(item.dataset, 'students')) }}<span v-if="dataset(item.dataset)?.incomplete">+</span></td>
            <td class="numeric metric">{{ number(stat(item.dataset, 'groups')) }}</td>
            <td class="numeric" :class="{ attention: (stat(item.dataset, 'withoutGroup') || 0) > 0 }">{{ number(stat(item.dataset, 'withoutGroup')) }}</td>
            <td><span class="state" :class="statusClass(item.dataset)">{{ statusText(item.dataset) }}</span></td>
            <td class="muted" :title="item.lastUsedAt ? 'Última solicitud observada' : 'No existe atribución de solicitudes por aplicación'">{{ item.lastUsedAt ? dateTime(item.lastUsedAt) : '—' }}</td>
          </tr>
          <tr v-if="!filteredConsumers.length"><td colspan="8" class="empty">Sin coincidencias</td></tr>
        </tbody>
      </table>
      <table class="overview" v-else>
        <thead><tr><th>API</th><th>Método</th><th>Consumidores</th><th class="numeric">Alumnos</th><th class="numeric">Grupos</th><th>Último dato</th></tr></thead>
        <tbody>
          <tr v-for="endpoint in filteredEndpoints" :key="endpoint.id" :title="sourceForEndpoint(endpoint.id) ? 'Ver resumen y registros' : 'Ruta inventariada; no es un padrón consultable aquí'" :tabindex="sourceForEndpoint(endpoint.id) ? 0 : -1" @click="sourceForEndpoint(endpoint.id) && pickEndpoint(endpoint)" @keydown.enter="sourceForEndpoint(endpoint.id) && pickEndpoint(endpoint)" :class="{picked: selectedDataset === sourceForEndpoint(endpoint.id)?.id}">
            <td><span class="app">{{ endpoint.label }}</span><code class="path">{{ endpoint.path }}</code></td>
            <td class="muted">{{ endpoint.method }}</td>
            <td>{{ endpointConsumers(endpoint.id) || 'No identificado' }}</td>
            <td class="numeric metric">{{ number(sourceForEndpoint(endpoint.id)?.stats?.students) }}</td>
            <td class="numeric metric">{{ number(sourceForEndpoint(endpoint.id)?.stats?.groups) }}</td>
            <td class="muted">{{ dateTime(sourceForEndpoint(endpoint.id)?.snapshotAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-note"><span>Alumnos y grupos corresponden a la API; el consumo real de cada aplicación aún no está instrumentado.</span><span>— No medido · Fuera de horario ≠ incidencia</span></div>

    <section v-if="selectedDataset" class="inspection">
      <div class="inspection-title">
        <div><h2>{{ selectedConsumerName || dataset(selectedDataset)?.label }}</h2><span>{{ dataset(selectedDataset)?.endpoint || '' }}</span></div>
        <button class="close" aria-label="Cerrar detalle" @click="selectedDataset = ''; selectedConsumer = ''">×</button>
      </div>
      <div class="tabs">
        <button :class="{ active: detail === 'summary' }" @click="detail = 'summary'">Resumen</button>
        <button :class="{ active: detail === 'records' }" @click="openRecords">Alumnos</button>
        <button :class="{ active: detail === 'origin' }" @click="detail = 'origin'">Origen</button>
      </div>
      <template v-if="detail === 'summary'">
        <div class="metrics">
          <div><span>Alumnos</span><b>{{ number(stat(selectedDataset, 'students')) }}</b></div>
          <div><span>Grupos</span><b>{{ number(stat(selectedDataset, 'groups')) }}</b></div>
          <div><span>Sin grupo</span><b>{{ number(stat(selectedDataset, 'withoutGroup')) }}</b></div>
          <div><span>Último dato</span><b class="date">{{ dateTime(dataset(selectedDataset)?.snapshotAt) }}</b></div>
        </div>
        <div class="compare-bar"><strong>Comparar con</strong><select v-model="compareId" @change="loadComparison"><option value="">Seleccionar fuente</option><option v-for="d in comparableDatasets" :key="d.id" :value="d.id">{{ d.label }}</option></select><button :disabled="!compareId || comparing" @click="openRecords">{{ comparing ? 'Consultando…' : 'Ver diferencias' }}</button></div>
        <table v-if="compareId" class="comparison"><thead><tr><th></th><th>{{ dataset(selectedDataset)?.label }}</th><th>{{ dataset(compareId)?.label }}</th><th>Δ</th></tr></thead>
          <tbody><tr v-for="metric in comparisonMetrics" :key="metric.key"><td>{{ metric.label }}</td><td>{{ number(stat(selectedDataset, metric.key)) }}</td><td>{{ number(stat(compareId, metric.key)) }}</td><td :class="{ attention: metricDelta(metric.key) !== '—' && metricDelta(metric.key) !== '0' }">{{ metricDelta(metric.key) }}</td></tr></tbody>
        </table>
        <p v-if="compareId && dataset(selectedDataset)?.scope !== dataset(compareId)?.scope" class="notice">Los conjuntos tienen criterios distintos. Una diferencia de totales no implica error.</p>
        <p v-if="dataset(selectedDataset)?.incomplete" class="notice">Resultado limitado a 5,000 filas: los totales pueden ser parciales.</p>
      </template>
      <template v-else-if="detail === 'records'">
        <div class="records-top">
          <div class="compare-select"><select v-model="compareId" @change="loadComparison"><option value="">Solo {{ dataset(selectedDataset)?.label }}</option><option v-for="d in comparableDatasets" :key="d.id" :value="d.id">vs {{ d.label }}</option></select></div>
          <input v-model="recordSearch" placeholder="Buscar matrícula, nombre, grado, grupo…" aria-label="Buscar registros" />
          <select v-model.number="pageSize" aria-label="Filas por página"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select>
          <button :disabled="!recordRows.length" @click="downloadCsv">CSV</button>
        </div>
        <p v-if="recordsLoading" class="notice">Consultando registros…</p>
        <p v-if="recordsError" class="error">{{ recordsError }}</p>
        <p v-if="recordIncomplete" class="notice">Vista parcial: se alcanzó el límite de 5,000 registros.</p>
        <div class="records-scroll" v-if="!recordsLoading && visibleRecordRows.length">
          <table class="records"><thead><tr><th v-for="col in recordColumns" :key="col">{{ col }}</th></tr></thead><tbody>
            <tr v-for="(row, i) in pagedRecords" :key="i" :class="{ mismatch: row._different === true }">
              <td v-for="col in recordColumns" :key="col" :title="display(row[col])">{{ display(row[col]) }}</td>
            </tr>
          </tbody></table>
        </div>
        <div v-else-if="!recordsLoading" class="empty">Sin registros disponibles</div>
        <footer class="pagination" v-if="visibleRecordRows.length"><span>{{ visibleRecordRows.length }} registros</span><div><button :disabled="page <= 1" @click="page--">Anterior</button>{{ page }} / {{ totalPages }}<button :disabled="page >= totalPages" @click="page++">Siguiente</button></div></footer>
      </template>
      <div v-else class="provenance">
        <dl><div><dt>Contrato</dt><dd><code>{{ dataset(selectedDataset)?.endpoint }}</code></dd></div><div v-if="selectedRelation?.endpoints?.length"><dt>APIs utilizadas</dt><dd>{{ selectedRelation.endpoints.map((id) => endpoints.find(e => e.id === id)?.label || id).join(" · ") }}</dd></div><div><dt>Origen previsto</dt><dd>{{ dataset(selectedDataset)?.origin }}</dd></div><div><dt>Origen reportado</dt><dd>{{ dataset(selectedDataset)?.originReported || 'No expuesto' }}</dd></div><div><dt>Última generación</dt><dd>{{ dateTime(dataset(selectedDataset)?.snapshotAt) }}</dd></div><div><dt>Última lectura upstream</dt><dd>{{ dateTime(dataset(selectedDataset)?.upstreamAt) }}</dd></div><div><dt>Respuesta generada</dt><dd>{{ dateTime(dataset(selectedDataset)?.responseAt) }}</dd></div><div><dt>Consulta DX</dt><dd>{{ observedAt ? dateTime(observedAt) : '—' }}</dd></div><div><dt>Último consumo por app</dt><dd>No instrumentado</dd></div></dl>
        <a v-if="selectedCode" :href="'https://github.com/' + selectedRepo + '/blob/main/' + selectedCode.split('/').slice(1).join('/')" target="_blank" rel="noopener noreferrer">Ver adaptador en GitHub ↗</a>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const plantel = ref('PM')
const cycle = ref('2026-2027')
const planteles = ref<string[]>(['PREEM','PREET','GM','PM','PT','SM','ST'])
const view = ref<'apps'|'apis'>('apps')
const search = ref('')
const loading = ref(false)
const error = ref('')
const overview = ref<any>(null)
const selectedDataset = ref('')
const selectedConsumer = ref('')
const selectedConsumerName = ref('')
const detail = ref<'summary'|'records'|'origin'>('summary')
const compareId = ref('')
const recordsLoading = ref(false)
const comparing = ref(false)
const recordsError = ref('')
const recordSearch = ref('')
const pageSize = ref(25)
const page = ref(1)
const cache = reactive<Record<string, any>>({})
let generation = 0

const consumers = computed<any[]>(() => overview.value?.consumers || [])
const sources = computed<any[]>(() => overview.value?.sources || [])
const endpoints = computed<any[]>(() => overview.value?.endpoints || [])
const observedAt = computed(() => overview.value?.measuredAt || null)
const dataset = (id: string): any => sources.value.find(d => d.id === id)
const sourceForEndpoint = (id: string): any => sources.value.find(d => d.endpointId === id)
const stat = (id: string, key: string) => dataset(id)?.stats?.[key] ?? null
const number = (n: any) => n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('es-MX')
const dateTime = (value: any) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
}
const statusClass = (id: string) => !dataset(id)?.ok ? 'unavailable' : dataset(id)?.fallback ? 'cached' : 'available'
const statusText = (id: string) => !dataset(id) ? 'Sin medir' : !dataset(id).ok ? 'No disponible' : dataset(id).originReported || (dataset(id).fallback ? 'Respaldo' : 'Disponible')
const filteredConsumers = computed(() => consumers.value.filter(c => [c.app,c.consumption,dataset(c.dataset)?.label].join(' ').toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es'))))
const endpointConsumers = (id: string) => consumers.value.filter(c => (c.endpoints || [dataset(c.dataset)?.endpointId]).includes(id)).map(c => c.app).join(', ')
const filteredEndpoints = computed(() => endpoints.value.filter(e => [e.label,e.path,endpointConsumers(e.id)].join(' ').toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es'))))
const comparableDatasets = computed(() => sources.value.filter(s => s.id !== selectedDataset.value))
const comparisonMetrics = [{label:'Alumnos',key:'students'},{label:'Grupos',key:'groups'},{label:'Sin grupo',key:'withoutGroup'}]
const metricDelta = (key: string) => {
  const a = stat(selectedDataset.value,key), b = stat(compareId.value,key)
  if (a === null || b === null) return '—'
  const delta = Number(b)-Number(a)
  return delta > 0 ? '+'+delta : String(delta)
}
const selectedRelation = computed(() => consumers.value.find(c => c.id === selectedConsumer.value))
const selectedCode = computed(() => selectedRelation.value?.code || '')
const selectedRepo = computed(() => selectedRelation.value?.repository || '')
const keyFor = (id: string) => [plantel.value,cycle.value,id].join(':')
const display = (value: any) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const clean = (v: any) => String(v ?? '').trim()
const identity = (r: any) => clean(r.matricula || r.studentId).toUpperCase()

onMounted(async () => {
  try {
    const catalog: any = await $fetch('/api/control-escolar/dx-api-lab/catalog')
    if (catalog?.planteles?.length) planteles.value = catalog.planteles.filter((p: string) => ['PREEM','PREET','GM','PM','PT','SM','ST'].includes(p))
    if (catalog?.defaults?.ciclo) cycle.value = catalog.defaults.ciclo
  } catch {}
  await refresh()
})
const refresh = async () => {
  const current = ++generation
  loading.value = true
  error.value = ''
  selectedDataset.value = ''
  selectedConsumer.value = ''
  compareId.value = ''
  Object.keys(cache).forEach(key => delete cache[key])
  overview.value = null
  try {
    const result = await $fetch('/api/control-escolar/dx-api-lab/overview',{ method:'POST',body:{plantel:plantel.value,ciclo:cycle.value} })
    if (current === generation) overview.value = result
  } catch (e: any) {
    if (current === generation) error.value = e?.data?.message || e?.message || 'No se pudo consultar el panorama.'
  } finally { if (current === generation) loading.value = false }
}
const pickConsumer = (c: any) => {
  selectedConsumer.value = c.id
  selectedConsumerName.value = c.app
  selectedDataset.value = c.dataset
  compareId.value = ''
  detail.value = 'summary'
}
const pickEndpoint = (e: any) => {
  const s = sourceForEndpoint(e.id)
  selectedConsumer.value = ''
  selectedConsumerName.value = e.label
  selectedDataset.value = s?.id || ''
  compareId.value = ''
  detail.value = 'summary'
}
const loadDataset = async (id: string) => {
  if (!id) return null
  const key = keyFor(id)
  if (cache[key]) return cache[key]
  const result: any = await $fetch('/api/control-escolar/dx-api-lab/records',{
    method:'POST',body:{dataset:id,plantel:plantel.value,ciclo:cycle.value}
  })
  cache[key] = result
  return result
}
const loadComparison = async () => {
  if (detail.value === 'records') await openRecords()
}
const openRecords = async () => {
  detail.value = 'records'
  recordSearch.value = ''
  page.value = 1
  recordsLoading.value = true
  recordsError.value = ''
  comparing.value = Boolean(compareId.value)
  const scopeKey = [plantel.value,cycle.value,selectedDataset.value,compareId.value].join(':')
  try {
    const results = await Promise.all([loadDataset(selectedDataset.value),compareId.value ? loadDataset(compareId.value) : null])
    if (scopeKey !== [plantel.value,cycle.value,selectedDataset.value,compareId.value].join(':')) return
    if (!results[0]?.ok || (compareId.value && !results[1]?.ok)) {
      recordsError.value = results[0]?.error?.message || results[1]?.error?.message || 'La fuente no respondió.'
    }
  } catch (e: any) { recordsError.value = e?.data?.message || e?.message || 'Consulta fallida.' }
  finally { recordsLoading.value = false; comparing.value = false }
}
const recordIncomplete = computed(() => Boolean(cache[keyFor(selectedDataset.value)]?.incomplete || (compareId.value && cache[keyFor(compareId.value)]?.incomplete)))
const compareRows = computed<any[]>(() => {
  const first = cache[keyFor(selectedDataset.value)]?.rows || []
  if (!compareId.value) return first
  const second = cache[keyFor(compareId.value)]?.rows || []
  const a = new Map<string, any>(first.filter(identity).map((r:any): [string, any] => [identity(r),r]))
  const b = new Map<string, any>(second.filter(identity).map((r:any): [string, any] => [identity(r),r]))
  const ids = new Set([...a.keys(),...b.keys()])
  return Array.from(ids).map(id => {
    const left:any = a.get(id), right:any = b.get(id)
    const gradeA = clean(left?.grado || left?.grade), gradeB = clean(right?.grado || right?.grade)
    const groupA = clean(left?.grupo || left?.group), groupB = clean(right?.grupo || right?.group)
    return {matricula:id,grado_A:gradeA,grupo_A:groupA,grado_B:gradeB,grupo_B:groupB,
      _different: !left || !right || gradeA !== gradeB || groupA !== groupB}
  })
})
const recordRows = computed<any[]>(() => compareRows.value)
const visibleRecordRows = computed<any[]>(() => recordRows.value.filter(r=>JSON.stringify(r).toLocaleLowerCase('es').includes(recordSearch.value.trim().toLocaleLowerCase('es'))))
watch([recordSearch,pageSize],()=>{page.value=1})
const totalPages = computed(() => Math.max(1,Math.ceil(visibleRecordRows.value.length/pageSize.value)))
const pagedRecords = computed(() => visibleRecordRows.value.slice((page.value-1)*pageSize.value,page.value*pageSize.value))
const recordColumns = computed(() => {
  if (compareId.value) return ['matricula','grado_A','grupo_A','grado_B','grupo_B']
  const keys = new Set<string>()
  for (const row of visibleRecordRows.value.slice(0,100)) {
    Object.keys(row || {}).forEach(k => { if (!k.startsWith('_')) keys.add(k) })
  }
  const first = ['matricula','nombreCompleto','grado','grupo'].filter(k=>keys.has(k))
  return [...first,...Array.from(keys).filter(k=>!first.includes(k))].slice(0,24)
})
const csvQuote = (v: any) => '"'+display(v).replace(/"/g,'""')+'"'
const downloadCsv = () => {
  const cols = recordColumns.value
  const text = [cols.map(csvQuote).join(','),...visibleRecordRows.value.map(row=>cols.map(k=>csvQuote(row?.[k])).join(','))].join('\n')
  const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download='aurora-'+plantel.value+'-'+selectedDataset.value+'.csv';a.click();URL.revokeObjectURL(url)
}
</script>

<style scoped>
:global(body){margin:0;background:#f6f7f9;color:#172033;font-family:Inter,Montserrat,system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}
.integrations{max-width:1600px;margin:auto;padding:28px 30px 60px}
.header,.identity,.filters,.toolbar,.inspection-title,.compare-bar,.records-top,.pagination{display:flex;align-items:center;gap:14px}
.header{justify-content:space-between;margin-bottom:26px}
.identity{gap:12px}.mark{display:grid;place-items:center;width:39px;height:39px;background:#172033;color:white;border-radius:12px;font-size:19px;font-weight:750}
h1{font-size:24px;line-height:1.1;margin:0;font-weight:750;letter-spacing:-.045em}.subtitle{display:block;color:#8992a1;font-size:11px;margin-top:4px}
.filters{gap:9px}.filters label{display:flex;gap:6px;align-items:center;color:#778196;font-size:12px}
input,select,button{font:inherit}select,input{background:#fff;border:1px solid #dfe3e9;color:#172033;border-radius:9px;min-height:37px;padding:7px 10px}
.filters select{min-width:100px}.filters input{width:110px}
button{cursor:pointer}.refresh,.compare-bar button,.records-top button{border:1px solid #dfe3e9;background:#fff;color:#172033;border-radius:9px;padding:9px 13px;font-weight:600;font-size:12px;white-space:nowrap}
button:disabled{opacity:.45;cursor:default}.refresh:hover:not(:disabled),.records-top button:hover{background:#f1f4f8}
.spinning{display:inline-block;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.toolbar{margin-bottom:12px}.switch{display:inline-flex;gap:3px;padding:3px;border:1px solid #e1e5ec;border-radius:10px;background:#ebeff4}
.switch button,.tabs button{border:0;background:transparent;color:#69758a;padding:8px 13px;font-size:12px;font-weight:650;border-radius:7px}
.switch button.active{background:#fff;color:#162033;box-shadow:0 1px 3px #17203315}
.search{flex:1;min-width:170px}.measured{font-size:11px;color:#7e8999;white-space:nowrap}
.table-shell{background:white;border:1px solid #e3e7ed;border-radius:13px;overflow:auto;box-shadow:0 5px 22px #17203308}
table{width:100%;border-collapse:collapse;text-align:left}th{color:#808b9d;font-size:10px;font-weight:700;white-space:nowrap;letter-spacing:.015em}
.overview th{padding:15px 16px;border-bottom:1px solid #e7ebf0;background:#fbfcfd}
.overview td{padding:16px;border-bottom:1px solid #eef0f4;font-size:12px;white-space:nowrap}
.overview tbody tr{cursor:default}.overview tbody tr[tabindex="0"]{cursor:pointer}.overview tbody tr:hover{background:#f6f8fb}.overview tbody tr.picked{background:#f0f4fa}.overview tbody tr:last-child td{border-bottom:0}
.app{font-size:12px;font-weight:720;color:#172033}.muted{color:#778499!important}.numeric{text-align:right;font-variant-numeric:tabular-nums}.metric{font-size:16px!important;font-weight:730;font-variant-numeric:tabular-nums}
.state{display:inline-block;border-radius:5px;padding:4px 7px;max-width:145px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;color:#496476;background:#eef4f7;font-size:11px}
.state.unavailable{color:#a74738;background:#fff1eb}.state.cached{background:#fff5e7;color:#91602d}.attention{color:#b45338;font-weight:750}
.path{display:block;font-size:10px;color:#8992a1;margin-top:4px;font-weight:400;white-space:normal;word-break:break-all;max-width:360px}
.table-note{display:flex;justify-content:space-between;gap:12px;margin:9px 2px 20px;color:#7c8797;font-size:10px}
.inspection{background:white;border:1px solid #e3e7ed;border-radius:13px;padding:19px 20px;margin-top:10px}
.inspection-title{justify-content:space-between;align-items:flex-start}.inspection-title h2{font-size:17px;letter-spacing:-.025em;margin:0 0 6px}.inspection-title span{font-size:11px;color:#8a94a3;word-break:break-all}
.close{border:0;background:#f3f5f8;border-radius:8px;font-size:21px;width:32px;height:32px}
.tabs{display:flex;gap:10px;margin-top:15px;border-bottom:1px solid #e8ecf2}.tabs button{border-radius:0;padding:11px 15px;border-bottom:2px solid transparent}
.tabs button.active{border-bottom-color:#172033;color:#172033}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#e8edf2;border:1px solid #e8edf2;border-radius:10px;overflow:hidden;margin:18px 0}
.metrics>div{background:#fff;padding:19px}.metrics span{display:block;font-size:11px;color:#8b96a6}.metrics b{display:block;margin-top:7px;font-size:25px;font-weight:760;letter-spacing:-.04em}
.metrics b.date{font-size:16px;letter-spacing:0}
.compare-bar{margin:15px 0;flex-wrap:wrap}.compare-bar strong{font-size:12px;margin-right:auto}.compare-bar select{min-width:190px}.compare-bar button{background:#172033;color:#fff}
.comparison{max-width:700px;margin:15px 0}.comparison td,.comparison th{padding:10px 13px;border-bottom:1px solid #ebeff3;font-size:12px}.comparison td:not(:first-child){font-variant-numeric:tabular-nums}
.notice{color:#7b8796;font-size:12px;margin:12px 0}.error{padding:11px 13px;color:#b42318;background:#fff2ef;border-radius:9px;font-size:12px}
.records-top{margin:18px 0 10px;flex-wrap:wrap}.records-top input{flex:1;min-width:210px}.records-top select{max-width:230px}
.records-scroll{border:1px solid #e7ebf0;border-radius:9px;overflow:auto;max-height:59vh}.records th{position:sticky;top:0;background:#f6f8fa;z-index:1}.records td,.records th{padding:10px 13px;white-space:nowrap;border-bottom:1px solid #eef0f4;font-size:11px;max-width:320px;overflow:hidden;text-overflow:ellipsis}
.records tr.mismatch{background:#fff9f3}.pagination{justify-content:space-between;margin-top:15px;font-size:11px;color:#7c8797}.pagination div{display:flex;gap:14px;align-items:center}.pagination button{border:1px solid #e3e7ed;border-radius:7px;background:#fff;padding:6px 10px;font-size:11px}
.provenance{margin-top:15px;max-width:850px}.provenance dl{margin:0}.provenance dl div{display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid #eef0f4}.provenance dt{color:#7c8797;font-size:12px}.provenance dd{margin:0;text-align:right;font-size:12px;overflow-wrap:anywhere}.provenance a{display:inline-block;margin-top:16px;font-size:12px;color:#294d8c}.empty{text-align:center;padding:28px;color:#8a94a3}
@media(max-width:930px){.integrations{padding:18px 15px 45px}.header{align-items:flex-start;flex-direction:column;gap:16px}.filters{width:100%;flex-wrap:wrap}.toolbar{flex-wrap:wrap}.measured{margin-left:auto}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.overview{min-width:980px}.table-note{flex-wrap:wrap}}
@media(max-width:550px){.integrations{padding:14px 10px 40px}.filters label{flex:1}.filters select,.filters input{width:100%;min-width:0}.search{flex-basis:100%}.inspection{padding:14px}.metrics>div{padding:13px}.metrics b{font-size:22px}.records-top input{flex-basis:100%}.provenance dl div{display:block}.provenance dd{text-align:left;margin-top:5px}}
</style>
