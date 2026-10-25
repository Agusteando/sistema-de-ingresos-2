<template>
  <main class="integrations">
    <header class="heading">
      <div class="title"><a href="/control-escolar" aria-label="Volver a Aurora">A</a><h1>Integraciones</h1></div>
      <div class="controls"><input v-model="cycle" @change="reload(true)" aria-label="Ciclo escolar" class="cycle"/><button @click="reload(true)" :disabled="loading" :aria-busy="loading">{{ loading ? 'Actualizando…' : 'Actualizar' }}</button></div>
    </header>
    <div class="toolbar">
      <input v-model="search" type="search" placeholder="Buscar aplicación, ruta o tabla…" aria-label="Buscar integraciones"/>
      <div class="totals"><b>{{ apps.length }}</b> apps <span>·</span> <b>{{ routes.length }}</b> rutas <span>·</span> <b>{{ campuses.length }}</b> planteles</div>
    </div>
    <div v-if="discovery.running" class="discovery" role="status"><span class="pulse"/> Descubriendo repositorios <b>{{ discovery.scanned }} / {{ discovery.total || '…' }}</b><progress v-if="discovery.total" :value="discovery.scanned" :max="discovery.total"/></div>
    <p v-if="discovery.error" class="alert" role="alert">{{ discoveryError }} <code>{{ discovery.error }}</code></p>
    <details v-if="discovery.failures?.length" class="coverage"><summary>{{ discovery.failures.length }} repositorios pendientes de lectura</summary><div v-for="failure in discovery.failures" :key="failure.repository">{{ failure.repository }} <code>{{ failure.code }}</code></div></details>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-if="overview?.dataErrors?.length" class="alert" role="status">Hay fuentes que no se pudieron leer: {{ overview.dataErrors.map((item: any) => [item.table, item.code].filter(Boolean).join(' · ')).join('; ') }}</p>

    <div class="matrix-scroll">
      <table class="matrix">
        <caption class="sr-only">Todas las aplicaciones descubiertas y todos los planteles autorizados. Cada celda muestra alumnos y grupos de la fuente indicada.</caption>
        <thead><tr><th class="selection"><span class="sr-only">Comparar</span></th><th class="application">Aplicación</th><th>Datos</th><th>Vía</th><th class="number">Alumnos</th><th class="number">Grupos</th><th class="number">Sin grupo</th><th>Último uso</th><th v-for="campus in campuses" :key="campus" class="campus">{{ campus }}</th></tr></thead>
        <tbody>
          <tr v-for="app in visibleApps" :key="app.id" :class="{ selected: selectedApp?.id === app.id }">
            <td class="selection"><input type="checkbox" :checked="compared.includes(app.id)" @change="toggleCompare(app.id)" :disabled="!app.source || (!compared.includes(app.id) && compared.length === 2)" :aria-label="'Comparar ' + app.name"/></td>
            <td class="application"><button class="app-name" @click="inspectApp(app)">{{ app.name }}<span aria-hidden="true">↗</span></button></td>
            <td><select v-if="app.source" class="source-select" :value="app.source.id" :aria-label="'Fuente de ' + app.name" @change="chooseSource(app.id, $event)" :title="sourceKind(app.source) + ' · ' + app.source.label"><option v-for="source in connectedSources(app)" :key="source.id" :value="source.id">{{ sourceKind(source) }} · {{ source.label }}</option></select><span v-else class="data-kind">Sin padrón medido</span></td>
            <td><button class="via" @click="inspectApp(app, true)" :title="app.patterns.join(' · ')">{{ app.shared.length ? 'SQL' : '' }}{{ app.shared.length && app.contracts.length ? ' + ' : '' }}{{ app.contracts.length ? 'HTTP' : '' }} <span>{{ app.contracts.length || '' }}</span></button></td>
            <td class="number strong">{{ num(sum(app.source, 'students')) }}</td><td class="number">{{ num(sum(app.source, 'groups')) }}</td><td class="number" :class="{ warn: sum(app.source, 'withoutGroup') > 0 }">{{ num(sum(app.source, 'withoutGroup')) }}</td>
            <td class="last"><span :title="lastUseTitle(app)">{{ ago(app.lastUse?.at) }}</span><span v-if="app.lastUse" class="usage-kind" :title="app.attributed ? 'Origen de navegador coincidente; no confirma procesamiento' : 'Actividad de la ruta compartida; no atribuida a esta aplicación'">{{ app.attributed ? 'Origen' : 'API' }}</span></td>
            <td v-for="campus in campuses" :key="campus" class="campus" :class="cellState(app.source, campus)"><button @click="inspectApp(app, false, campus)" :disabled="!app.source?.campuses?.[campus]" :title="cellTitle(app.source, campus)"><template v-if="app.source?.campuses?.[campus]">{{ num(app.source.campuses[campus].students) }}{{ app.source.campuses[campus].partial ? '+' : '' }}<span class="slash">/</span><span class="groups">{{ num(app.source.campuses[campus].groups) }}</span></template><template v-else>—</template></button></td>
          </tr>
          <tr v-if="!visibleApps.length"><td :colspan="8 + campuses.length" class="empty">{{ discovery.running ? 'Leyendo las aplicaciones…' : search ? 'Sin coincidencias' : 'Todavía no hay consumidores descubiertos.' }}</td></tr>
        </tbody>
      </table>
    </div>
    <footer class="matrix-footer"><span>Planteles: <b>alumnos / grupos</b> <i class="dot warn-dot"/> Sin grupo <i class="dot stale-dot"/> Snapshot vencido</span><span title="Último uso muestra actividad HTTP observada. SQL no produce una solicitud HTTP y compartir ruta no identifica al consumidor.">Último uso: <b>Origen</b> navegador · <b>API</b> ruta compartida · <b>—</b> sin observación</span></footer>
    <div class="comparison-bar" v-if="compared.length"><span>{{ compared.map(id => apps.find(app => app.id === id)?.name).join(' / ') }}</span><button :disabled="compared.length !== 2" @click="compareApps">Comparar {{ compared.length }}</button><button class="quiet" @click="compared = []">Limpiar</button></div>

    <details class="route-inventory">
      <summary>{{ unassignedRoutes.length }} rutas sin referencia en los repositorios {{ discovery.running ? 'leídos hasta ahora' : 'analizados' }} <span>{{ discovery.checkedAt ? 'Revisado ' + ago(discovery.checkedAt) : '' }}</span></summary>
      <div class="route-scroll"><table><thead><tr><th>Método</th><th>Ruta</th><th>Última solicitud</th><th>Resultado</th><th>Origen</th></tr></thead><tbody><tr v-for="route in unassignedRoutes" :key="route.id"><td>{{ route.method }}</td><td><a :href="codeUrl(producerRepo, route.file)" target="_blank" rel="noopener noreferrer"><code>{{ route.path }}</code></a></td><td>{{ dateTime(routeUse(route.id)?.at) }}</td><td>{{ routeUse(route.id)?.status || '—' }} {{ routeUse(route.id)?.errorCode || '' }}</td><td>{{ routeUse(route.id)?.origin || routeUse(route.id)?.credential || '—' }}</td></tr></tbody></table></div>
    </details>
    <div class="coverage-line"><span>{{ overview?.usage?.available ? 'Actividad observada · ventana de hasta 7 días' : 'Actividad histórica no disponible; observaciones de esta instancia' }}{{ overview?.usage?.truncated ? ' · muestra limitada' : '' }}</span><span v-if="overview?.measuredAt">{{ dateTime(overview.measuredAt) }}</span></div>

    <section v-if="selectedApp" ref="inspection" class="inspection" aria-label="Explorar datos">
      <header><h2>{{ selectedApp.name }}</h2><button class="quiet" @click="closeInspection" aria-label="Cerrar explorador">×</button></header>
      <div class="explorer-controls">
        <select v-model="selectedSource" @change="clearRecords" aria-label="Fuente de datos"><option value="">Seleccionar fuente</option><option v-for="source in availableSources" :value="source.id" :key="source.id">{{ sourceKind(source) }} · {{ source.label }}</option></select>
        <select v-model="detailCampus" @change="clearRecords" aria-label="Filtrar plantel"><option value="">Todos los planteles</option><option v-for="campus in campuses" :key="campus">{{ campus }}</option></select>
        <select v-model="comparisonSource" @change="clearRecords" aria-label="Comparar con otra fuente"><option value="">Comparar con…</option><option v-for="source in sources.filter(source => source.id !== selectedSource)" :value="source.id" :key="source.id">{{ ownerLabel(source) }} · {{ sourceKind(source) }} · {{ source.label }}</option></select>
      </div>
      <p v-if="currentSource?.cycle === null || (otherSource && currentSource?.cycle !== otherSource?.cycle)" class="notice">Esta caché no separa ciclos. Los totales se muestran con su alcance original.</p>
      <p v-if="otherSource" class="notice">{{ currentSource?.id === otherSource.id ? 'Ambas aplicaciones usan esta misma fuente.' : 'Cada fuente conserva su población original; una diferencia de totales no acredita un error.' }}</p>
      <p v-if="currentSource?.kind === 'http-response'" class="notice">Última respuesta observada. El contenido histórico no se guarda; los registros actuales se consultan desde sus fuentes disponibles.</p>
      <div v-if="currentSource" class="detail-scroll"><table class="summary-table"><thead><tr><th>Plantel</th><th>Alumnos</th><th>Grupos</th><th>Sin grupo</th><template v-if="otherSource"><th>Alumnos B</th><th>Δ alumnos</th><th>Grupos B</th><th>Δ grupos</th></template><th>Datos desde</th><th></th></tr></thead><tbody>
        <tr v-for="campus in detailCampuses" :key="campus"><th>{{ campus }}</th><td>{{ num(currentSource.campuses[campus]?.students) }}</td><td>{{ num(currentSource.campuses[campus]?.groups) }}</td><td :class="{ warn: currentSource.campuses[campus]?.withoutGroup > 0 }">{{ num(currentSource.campuses[campus]?.withoutGroup) }}</td><template v-if="otherSource"><td>{{ num(otherSource.campuses[campus]?.students) }}</td><td :class="{ warn: difference(campus, 'students') !== '0' && difference(campus, 'students') !== '—' }">{{ difference(campus, 'students') }}</td><td>{{ num(otherSource.campuses[campus]?.groups) }}</td><td>{{ difference(campus, 'groups') }}</td></template><td :title="cellTitle(currentSource, campus)">{{ dateTime(currentSource.campuses[campus]?.generatedAt || currentSource.campuses[campus]?.updatedAt || currentSource.campuses[campus]?.observedAt) }}<span v-if="currentSource.campuses[campus]?.alternatives" class="scope-count"> +{{ currentSource.campuses[campus].alternatives }} alcances</span></td><td><button class="text-button" @click="showRecords(campus)" :disabled="!canReadRecords || !currentSource.campuses[campus]">Matrículas →</button></td></tr>
      </tbody></table></div>
      <div class="detail-actions" v-if="canReadRecords"><button @click="showRecords('')" :disabled="recordsLoading">{{ recordsLoading ? 'Consultando…' : otherSource ? 'Comparar matrículas' : 'Ver matrículas' }}</button><span>{{ currentSource?.table }}</span></div>

      <div v-if="recordsOpen" class="record-explorer">
        <div class="record-controls"><input v-model="recordSearch" type="search" placeholder="Buscar cualquier texto…" aria-label="Buscar matrículas, nombres, grupos o valores"/><label v-if="otherSource"><input v-model="onlyDifferences" type="checkbox"/> Solo diferencias</label><button @click="exportCsv" :disabled="!filteredRecords.length">CSV</button></div>
        <p v-if="recordsError" class="alert" role="alert">{{ recordsError }}</p><p v-if="partialRecords" class="notice">Lectura parcial: algún plantel no respondió o se alcanzó el límite de 25,000 registros.</p>
        <p v-if="recordsLoading" class="notice" role="status">Consultando registros…</p>
        <div v-else class="record-scroll"><table><thead><tr><th v-for="column in recordColumns" :key="column">{{ column }}</th></tr></thead><tbody><tr v-for="(record, index) in pageRecords" :key="index" :class="{ mismatch: record.diferencia }"><td v-for="column in recordColumns" :key="column">{{ display(record[column]) }}</td></tr><tr v-if="!pageRecords.length"><td :colspan="recordColumns.length" class="empty">Sin coincidencias</td></tr></tbody></table></div>
        <div class="pagination"><span>{{ num(filteredRecords.length) }} registros</span><div><button :disabled="page === 1" @click="page--">←</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages" @click="page++">→</button></div></div>
      </div>

      <details :open="showOrigin" class="provenance"><summary>Rutas y origen <span>{{ selectedApp.contracts.length }} HTTP · {{ selectedApp.shared.length }} SQL</span></summary>
        <p v-if="currentSource" class="notice">{{ currentSource.table || currentSource.label }}{{ currentSource.version ? ' · ' + currentSource.version : '' }} · {{ sourceKind(currentSource) }}</p>
        <div v-for="relation in selectedApp.contracts" :key="relation.routeId" class="route-evidence"><div><code>{{ relation.routeId }}</code><span>{{ dateTime(routeUse(relation.routeId)?.at) }} {{ routeUse(relation.routeId)?.status || '' }} {{ routeUse(relation.routeId)?.errorCode || '' }}</span></div><a v-for="ref in relation.evidence" :key="ref.path + ref.line" :href="codeUrl(selectedApp.id, ref.path, ref.line, selectedApp.revision || selectedApp.branch)" target="_blank" rel="noopener noreferrer">{{ ref.path }}:{{ ref.line }} ↗</a><code v-if="routeUse(relation.routeId)?.requestId">{{ routeUse(relation.routeId).requestId }}</code><details v-if="routeById(relation.routeId)?.lineage?.length"><summary>Origen en Aurora</summary><a v-for="path in routeById(relation.routeId).lineage" :key="path" :href="codeUrl(producerRepo, path)" target="_blank" rel="noopener noreferrer">{{ path }} ↗</a></details></div>
        <div v-for="relation in selectedApp.shared" :key="relation.table" class="route-evidence"><code>SQL · {{ relation.table }} {{ relation.versions.join(' · ') }}</code><a v-for="ref in relation.evidence" :key="ref.path + ref.line" :href="codeUrl(selectedApp.id, ref.path, ref.line, selectedApp.revision || selectedApp.branch)" target="_blank" rel="noopener noreferrer">{{ ref.path }}:{{ ref.line }} ↗</a></div>
        <p class="notice">El código acredita la dependencia. Una respuesta entregada o una fila en caché no acredita lo que una pantalla mostró.</p>
      </details>
    </section>
  </main>
</template>

<script setup lang="ts">
import { automaticSchoolCycleKey, formatCicloLabel } from '~/shared/utils/ciclo'
import { compareStudentRecords } from '~/shared/utils/dxDiscovery.mjs'
definePageMeta({ layout: false })
const cycle = ref(formatCicloLabel(automaticSchoolCycleKey()))
const overview = ref<any>(null), loading = ref(false), error = ref(''), search = ref('')
const sourceChoices = reactive<Record<string, string>>({})
const compared = ref<string[]>([]), selectedApp = ref<any>(null), selectedSource = ref(''), comparisonSource = ref(''), detailCampus = ref(''), showOrigin = ref(false)
const inspection = ref<HTMLElement | null>(null)
const recordsOpen = ref(false), recordsLoading = ref(false), recordsError = ref(''), partialRecords = ref(false)
const leftRecords = ref<any[]>([]), rightRecords = ref<any[]>([]), recordSearch = ref(''), onlyDifferences = ref(false), page = ref(1)
let requestGeneration = 0, recordGeneration = 0, refreshTimer: ReturnType<typeof setTimeout> | null = null
const discovery = computed(() => overview.value?.discovery || {})
const routes = computed<any[]>(() => overview.value?.routes || [])
const sources = computed<any[]>(() => overview.value?.sources || [])
const campuses = computed<string[]>(() => overview.value?.planteles || [])
const producerRepo = 'Agusteando/sistema-de-ingresos-2'
const routeById = (id: string) => routes.value.find(route => route.id === id)
const routeUse = (id: string) => (overview.value?.usage?.records || []).filter((record: any) => record.routeId === id && !record.probe).sort((a: any, b: any) => b.at.localeCompare(a.at))[0]
const sourceKind = (source: any) => !source ? 'Sin padrón medido' : source.kind === 'consumer-cache' ? 'Caché de app' : source.kind === 'http-live' ? 'API por consultar' : source.kind === 'http-response' ? 'Respuesta API' : 'Snapshot'
const connectedSources = (app: any) => sources.value.filter(source => source.owners?.includes(app.id) || source.routeIds?.some((id: string) => app.contracts.some((relation: any) => relation.routeId === id)))
const apps = computed<any[]>(() => (discovery.value.consumers || []).map((app: any) => {
  const connected = connectedSources(app)
  const source = connected.find(source => source.id === sourceChoices[app.id])
    || connected.find(source => source.kind === 'consumer-cache' && Object.keys(source.campuses).length)
    || connected.find(source => source.owners.includes(app.id) && Object.keys(source.campuses).length)
    || connected.find(source => source.kind === 'http-response' && Object.keys(source.campuses).length)
    || connected.find(source => Object.keys(source.campuses).length)
    || connected.find(source => source.readable)
    || connected[0]
  const uses = (overview.value?.usage?.records || []).filter((use: any) => !use.probe && app.contracts.some((ref: any) => ref.routeId === use.routeId)).sort((a: any, b: any) => b.at.localeCompare(a.at))
  const attributed = uses.find((use: any) => use.status >= 200 && use.status < 300 && app.domains?.includes(use.origin))
  return { ...app, source, lastUse: attributed || uses[0] || null, attributed: Boolean(attributed) }
}))
const visibleApps = computed(() => apps.value.filter(app => JSON.stringify([app.name, app.id, app.patterns, app.shared, app.contracts]).toLocaleLowerCase('es').includes(search.value.trim().toLocaleLowerCase('es'))))
const unassignedRoutes = computed(() => routes.value.filter(route => !apps.value.some(app => app.contracts.some((ref: any) => ref.routeId === route.id))))
const currentSource = computed(() => sources.value.find(source => source.id === selectedSource.value))
const otherSource = computed(() => sources.value.find(source => source.id === comparisonSource.value))
const availableSources = computed(() => selectedApp.value ? connectedSources(selectedApp.value) : [])
const detailCampuses = computed(() => detailCampus.value ? [detailCampus.value] : campuses.value)
const readableSource = (source: any) => source && (!source.kind.startsWith('http') || source.readable)
const canReadRecords = computed(() => readableSource(currentSource.value) && (!otherSource.value || readableSource(otherSource.value)))
const num = (value: any) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('es-MX')
const sum = (source: any, key: string): any => !source || !Object.keys(source.campuses).length ? null : Object.values<any>(source.campuses).reduce((sum, value) => sum + Number(value?.[key] || 0), 0)
const dateTime = (value: any) => { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—' }
const ago = (value: any) => { if (!value) return '—'; const delta = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return delta < 1 ? 'ahora' : delta < 60 ? delta + ' min' : delta < 1440 ? Math.floor(delta / 60) + ' h' : Math.floor(delta / 1440) + ' d' }
const cellState = (source: any, campus: string) => { const data = source?.campuses?.[campus]; return { 'has-gap': data?.withoutGroup > 0, stale: data?.staleAfter && new Date(data.staleAfter).getTime() < Date.now() } }
const cellTitle = (source: any, campus: string) => { const data = source?.campuses?.[campus]; return data ? [sourceKind(source), source.label, data.students + ' alumnos / ' + data.groups + ' grupos', data.withoutGroup + ' sin grupo', data.partial ? 'Respuesta paginada: estos totales son parciales' : '', data.generatedAt ? 'Generado ' + dateTime(data.generatedAt) : '', data.scopeKey || '', data.alternatives ? '+' + data.alternatives + ' alcances; se muestra el más reciente' : '', data.staleAfter ? 'Vigencia ' + dateTime(data.staleAfter) : ''].filter(Boolean).join('\n') : 'Sin datos medidos para este plantel' }
const lastUseTitle = (app: any) => !app.lastUse ? 'Sin observaciones HTTP en la cobertura disponible. Una lectura SQL no genera una llamada HTTP.' : [dateTime(app.lastUse.at), app.lastUse.routeId, 'HTTP ' + app.lastUse.status, app.attributed ? 'Origen de navegador coincidente. No confirma procesamiento.' : 'Actividad de la API compartida; consumidor no atribuible.'].join('\n')
const codeUrl = (repo: string, path: string, line?: number, branch = 'main') => 'https://github.com/' + repo + '/blob/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/') + (line ? '#L' + line : '')
const ownerLabel = (source: any) => (source.owners || []).map((id: string) => apps.value.find(app => app.id === id)?.name).filter(Boolean).join(', ') || 'Aurora'
const discoveryError = computed(() => discovery.value.error === 'GITHUB_CREDENTIAL_MISSING' ? 'La credencial de GitHub de Aurora no está disponible para descubrir repositorios.' : discovery.value.error === 'GITHUB_RATE_LIMIT' ? 'GitHub limitó temporalmente la lectura del inventario.' : 'No se pudo completar el descubrimiento.')
const reload = async (force = false) => {
  const generation = ++requestGeneration
  if (refreshTimer) clearTimeout(refreshTimer)
  loading.value = true; error.value = ''
  try {
    const result: any = await $fetch('/api/control-escolar/dx-api-lab/overview', { method: 'POST', body: { ciclo: cycle.value, force }, retry: 0 })
    if (generation !== requestGeneration) return
    overview.value = result
    if (selectedApp.value) selectedApp.value = apps.value.find(app => app.id === selectedApp.value.id) || null
    const poll = () => { if (document.hidden) { refreshTimer = setTimeout(poll, 60000); return }; void reload() }; refreshTimer = setTimeout(poll, result.discovery?.running ? 4000 : 60000)
  } catch (e: any) { if (generation === requestGeneration) error.value = e?.data?.message || e?.message || 'No se pudo consultar Aurora.' }
  finally { if (generation === requestGeneration) loading.value = false }
}
onMounted(() => reload(true))
onBeforeUnmount(() => { requestGeneration++; recordGeneration++; if (refreshTimer) clearTimeout(refreshTimer) })
const clearRecords = () => { recordGeneration++; recordsOpen.value = false; recordsLoading.value = false; recordsError.value = ''; leftRecords.value = []; rightRecords.value = []; page.value = 1 }
const closeInspection = () => { clearRecords(); selectedApp.value = null; selectedSource.value = ''; comparisonSource.value = '' }
const inspectApp = async (app: any, origin = false, campus = '') => { clearRecords(); selectedApp.value = app; selectedSource.value = app.source?.id || ''; comparisonSource.value = ''; detailCampus.value = campus; showOrigin.value = origin; await nextTick(); inspection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
const toggleCompare = (id: string) => { compared.value = compared.value.includes(id) ? compared.value.filter(value => value !== id) : [...compared.value, id].slice(0, 2) }
const chooseSource = (id: string, event: Event) => { sourceChoices[id] = (event.target as HTMLSelectElement).value }
const compareApps = async () => { const a = apps.value.find(app => app.id === compared.value[0]), b = apps.value.find(app => app.id === compared.value[1]); if (!a || !b) return; await inspectApp(a); comparisonSource.value = b.source?.id || '' }
const difference = (campus: string, key: string) => { const a = currentSource.value?.campuses[campus]?.[key], b = otherSource.value?.campuses[campus]?.[key]; if (a == null || b == null) return '—'; const n = b - a; return n > 0 ? '+' + n : String(n) }
const showRecords = async (campus: string) => {
  if (!canReadRecords.value) return
  const generation = ++recordGeneration
  recordsOpen.value = true; recordsLoading.value = true; recordsError.value = ''; recordSearch.value = ''; page.value = 1
  const read = (id: string) => $fetch<any>('/api/control-escolar/dx-api-lab/records', { method: 'POST', body: { source: id, ciclo: cycle.value, plantel: campus || detailCampus.value }, retry: 0 })
  try {
    const [a, b] = await Promise.all([read(selectedSource.value), comparisonSource.value ? read(comparisonSource.value) : null])
    if (generation !== recordGeneration) return
    leftRecords.value = a.rows || []; rightRecords.value = b?.rows || []; partialRecords.value = a.incomplete || b?.incomplete || false
    recordsError.value = [...(a.errors || []), ...(b?.errors || [])].map((error: any) => error.plantel + ': ' + error.code).join(' · ')
    if (a.campuses && currentSource.value) { Object.assign(currentSource.value.campuses, a.campuses); currentSource.value.kind = 'http-response' }
    if (b?.campuses && otherSource.value) { Object.assign(otherSource.value.campuses, b.campuses); otherSource.value.kind = 'http-response' }
  } catch (e: any) { if (generation === recordGeneration) recordsError.value = e?.data?.message || e?.message || 'No se pudieron consultar los registros.' }
  finally { if (generation === recordGeneration) recordsLoading.value = false }
}
const display = (value: any) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const recordRows = computed(() => {
  if (!otherSource.value) return leftRecords.value
  return compareStudentRecords(leftRecords.value, rightRecords.value, overview.value?.plantelAliases || {})
})
const filteredRecords = computed(() => recordRows.value.filter(row => (!onlyDifferences.value || !otherSource.value || row.diferencia) && JSON.stringify(row).toLocaleLowerCase('es').includes(recordSearch.value.trim().toLocaleLowerCase('es'))))
const recordColumns = computed(() => otherSource.value ? ['plantel', 'matricula', 'nombre', 'grado_A', 'grupo_A', 'grado_B', 'grupo_B', 'diferencia'] : [...new Set(leftRecords.value.flatMap(Object.keys))])
const pages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / 50)))
const pageRecords = computed(() => filteredRecords.value.slice((page.value - 1) * 50, page.value * 50))
watch([recordSearch, onlyDifferences], () => { page.value = 1 })
watch(cycle, clearRecords)
const exportCsv = () => {
  const escape = (value: any) => '"' + display(value).replace(/^[=+@\t\r-]/, "'$&").replaceAll('"', '""') + '"'
  const text = [recordColumns.value, ...filteredRecords.value.map(row => recordColumns.value.map(column => row[column]))].map(row => row.map(escape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'aurora-integraciones.csv'; a.click(); URL.revokeObjectURL(url)
}
</script>

<style scoped>
:global(body){margin:0;background:#f5f6f8;color:#202a3b;font-family:Inter,Montserrat,system-ui,sans-serif}*{box-sizing:border-box}.integrations{padding:26px 28px 48px;max-width:2100px;margin:auto}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.42}button,input,select{border:1px solid #dce1e7;background:#fff;border-radius:7px;color:inherit;padding:8px 11px;font-size:12px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #43749e;outline-offset:3px}button:hover:not(:disabled){background:#f0f3f7}.heading,.title,.controls,.toolbar,.totals{display:flex;align-items:center}.heading{justify-content:space-between;margin-bottom:24px}.title{gap:12px}.title>a{display:grid;place-items:center;color:white;background:#202d41;text-decoration:none;border-radius:9px;width:34px;height:34px;font-weight:700}h1{font-size:23px;letter-spacing:-.04em;margin:0}.controls{gap:8px}.cycle{width:112px}.toolbar{justify-content:space-between;gap:18px;margin-bottom:14px}.toolbar>input{width:420px;max-width:55%;background:#fff}.totals{gap:8px;font-size:12px;color:#788294;white-space:nowrap}.totals b{font-size:15px;font-variant-numeric:tabular-nums;color:#26364c}.totals span{color:#c1c7d1}.matrix-scroll{overflow:auto;background:white;border:1px solid #dde3eb;border-radius:10px;max-height:68vh;scrollbar-width:thin}.matrix{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;white-space:nowrap}th{font-size:10px;font-weight:650;color:#7b8798;text-align:left;background:#f9fafc}.matrix thead th{position:sticky;top:0;z-index:3;border-bottom:1px solid #dde3eb;padding:13px 10px}.matrix td{padding:14px 10px;border-bottom:1px solid #edf0f4;height:56px}.matrix tr:last-child td{border-bottom:0}.matrix tbody tr:hover td{background:#f8fafc}.matrix tbody tr.selected td{background:#edf3f8}.selection{width:35px;padding-right:0!important;padding-left:12px!important}.selection input{accent-color:#365c7e;vertical-align:middle}.matrix .application{position:sticky;left:0;min-width:174px;z-index:2;background:#fff;box-shadow:5px 0 8px -8px #52617c}.matrix thead .application{z-index:4;background:#f9fafc}.app-name,.via,.data-kind,.campus button{background:none;border:0;padding:0;border-radius:3px;white-space:nowrap}.app-name{font-weight:650;font-size:12px;display:flex;align-items:center;gap:12px;width:100%;text-align:left}.app-name span{color:#a8b5c4;font-size:12px;margin-left:auto}.source-select{border:0;background:transparent;max-width:135px;padding:4px 12px 4px 0;text-overflow:ellipsis;font-size:10px;color:#607083}.data-kind{font-size:10px;color:#607083}.via{font-size:10px;color:#50657d}.via span{color:#91a0b1}.number{text-align:right;font-variant-numeric:tabular-nums}.strong{font-size:16px;font-weight:700;color:#23334b}.last{min-width:94px;color:#64758b;font-variant-numeric:tabular-nums}.usage-kind{margin-left:5px;padding:2px 4px;border-radius:4px;background:#f0f3f7;font-size:9px;color:#74869b}.campus{text-align:right;font-variant-numeric:tabular-nums;border-left:1px solid #edf0f4}.matrix th.campus{min-width:68px;text-align:center}.campus button{font-size:12px;min-width:46px;font-weight:650;color:#354b64}.campus .slash{font-weight:400;color:#c3cbd5;padding:0 3px}.campus .groups{font-size:11px;font-weight:400;color:#8090a3}.campus.has-gap{box-shadow:inset 0 -2px #c98b59}.campus.stale button{text-decoration:underline;text-decoration-color:#d7b77f;text-underline-offset:5px}.warn{color:#b97035!important}.matrix-footer,.coverage-line{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:10px;color:#8793a3;padding:10px 2px}.matrix-footer b{font-weight:550;color:#5e7086}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 4px 0 13px}.warn-dot{background:#c98b59}.stale-dot{background:#d7b77f}.discovery{display:flex;align-items:center;gap:8px;font-size:12px;color:#62768e;margin:12px 0}.pulse{width:6px;height:6px;background:#5187af;border-radius:50%;animation:pulse 1.3s infinite}@keyframes pulse{50%{opacity:.3}}progress{height:4px;width:110px;accent-color:#5e89a9}.alert{font-size:12px;padding:10px 13px;background:#fff3e7;border:1px solid #f0dcc8;border-radius:7px;color:#8c5c32}.alert code{display:inline-block;margin-left:8px;font-size:10px}.coverage{font-size:11px;margin:10px 0;color:#956c43}.coverage div{padding:6px 14px}.coverage code{margin-left:10px}summary{cursor:pointer;font-size:11px;color:#5f7289}summary span{float:right;font-size:10px;color:#90a0b2}.route-inventory{margin-top:15px;border-top:1px solid #dce3ec;padding-top:15px}.route-scroll{overflow:auto;max-height:330px;margin-top:12px}.route-scroll table,.detail-scroll table,.record-scroll table{border-collapse:collapse;width:100%;font-size:11px}.route-scroll th,.route-scroll td,.detail-scroll th,.detail-scroll td,.record-scroll th,.record-scroll td{padding:11px 13px;border-bottom:1px solid #e9eef4;white-space:nowrap}.route-scroll a{color:#496581}.empty{text-align:center;padding:32px!important;color:#91a0b0}.comparison-bar{position:sticky;bottom:15px;z-index:5;display:flex;align-items:center;gap:9px;width:max-content;max-width:100%;margin:12px auto;padding:8px 10px 8px 16px;background:#26374d;color:white;border-radius:10px;box-shadow:0 6px 20px #25364e2b}.comparison-bar span{font-size:11px;margin-right:8px}.comparison-bar button{font-size:11px}.quiet{background:none;border:0;color:#8090a2}.inspection{margin-top:25px;background:white;border:1px solid #dbe3ed;border-radius:10px;padding:20px;scroll-margin-top:15px}.inspection>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:17px}h2{font-size:18px;letter-spacing:-.025em;margin:0}.inspection>header button{font-size:22px;padding:0 5px}.explorer-controls{display:flex;gap:8px;flex-wrap:wrap}.explorer-controls select{min-width:150px;max-width:43%;font-size:11px}.explorer-controls select:first-child{max-width:40%;flex:1}.detail-scroll{overflow:auto;margin:18px 0 10px}.summary-table td{font-variant-numeric:tabular-nums}.summary-table th{background:#fff}.scope-count{font-size:10px;color:#899aaf;margin-left:5px}.text-button{background:none;border:0;color:#476d91;font-size:11px;padding:0}.detail-actions{display:flex;align-items:center;gap:14px;margin:15px 0 0}.detail-actions>span{font-size:10px;color:#90a0b3}.notice{font-size:11px;line-height:1.6;color:#8290a2;margin:12px 0}.record-explorer{margin-top:20px;border-top:1px solid #e6ecf3;padding-top:18px}.record-controls{display:flex;align-items:center;gap:12px;margin-bottom:12px}.record-controls>input{flex:1;min-width:140px}.record-controls label{white-space:nowrap;font-size:11px;color:#72839a}.record-scroll{overflow:auto;max-height:50vh;border:1px solid #e3eaf1;border-radius:6px}.record-scroll th{position:sticky;top:0}.record-scroll td{max-width:350px;overflow:hidden;text-overflow:ellipsis}.mismatch{background:#fff7ed}.pagination{display:flex;justify-content:space-between;align-items:center;color:#8a98aa;font-size:11px;margin:12px 0}.pagination>div{display:flex;align-items:center;gap:12px}.pagination button{padding:5px 9px}.provenance{border-top:1px solid #e5ebf2;margin-top:20px;padding-top:16px}.route-evidence{padding:13px 0;border-bottom:1px solid #edf1f5}.route-evidence>div{display:flex;gap:15px;justify-content:space-between;font-size:10px;color:#91a0b2}.route-evidence code{font-size:11px;overflow-wrap:anywhere;white-space:normal;color:#536b87}.route-evidence a{display:block;color:#6e88a4;font-size:10px;text-decoration:none;margin-top:6px;overflow-wrap:anywhere}.route-evidence details{margin-top:10px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(min-width:1800px){.matrix td{padding:15px 12px}.matrix th.campus{min-width:75px}}.source-select{min-height:25px}@media(max-width:600px){.heading{flex-wrap:wrap;gap:14px}.controls{width:100%;justify-content:flex-end}}@media(max-width:800px){.integrations{padding:19px 13px 35px}.toolbar{align-items:flex-start;flex-direction:column;gap:12px}.toolbar>input{max-width:100%;width:100%}.matrix-scroll{max-height:65vh}.matrix .application{min-width:155px}.explorer-controls select,.explorer-controls select:first-child{max-width:100%;width:100%;flex:initial}.inspection{padding:15px}.record-controls{flex-wrap:wrap}.record-controls>input{flex-basis:100%}.comparison-bar{flex-wrap:wrap}.comparison-bar span{flex-basis:100%}.matrix-footer{font-size:9px;line-height:1.7}.route-evidence>div{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){.pulse{animation:none}}
</style>
