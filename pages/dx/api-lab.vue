<template>
  <main class="dx-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">AURORA · DX</p>
        <h1>Estado de integraciones</h1>
      </div>
      <div class="actions">
        <label class="cycle-field">
          <span>Ciclo</span>
          <input v-model.trim="cycle" aria-label="Ciclo escolar">
        </label>
        <div class="plantel-filter">
          <span>Plantel</span>
          <div class="search-select">
            <input v-model.trim="plantelQuery" list="aurora-planteles" placeholder="Todos los planteles" aria-label="Buscar plantel">
            <button v-if="plantelQuery" class="clear" type="button" aria-label="Limpiar plantel" @click="plantelQuery = ''">×</button>
          </div>
          <datalist id="aurora-planteles">
            <option v-for="plantel in planteles" :key="plantel" :value="plantel" />
          </datalist>
        </div>
        <button class="auto" :disabled="autoRunning || !catalog" @click="runAutoDx">
          <span class="auto-dot" :class="{ pulse: autoRunning }" />
          {{ autoRunning ? `Auto-DX ${progress.done}/${progress.total}` : 'Auto-DX' }}
        </button>
      </div>
    </header>

    <section class="summary-row" aria-live="polite">
      <div class="summary-chip"><span class="dot ok" />{{ stats.ok }} OK</div>
      <div class="summary-chip"><span class="dot partial" />{{ stats.partial }} parcial</div>
      <div class="summary-chip"><span class="dot error" />{{ stats.error }} error</div>
      <div class="summary-chip muted">{{ visiblePlanteles.length }} planteles · {{ apps.length }} apps</div>
    </section>

    <section class="matrix-card">
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="app-col">App</th>
              <th v-for="plantel in visiblePlanteles" :key="plantel" class="plantel-head">{{ plantel }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in apps" :key="app.id">
              <th class="app-col app-name">
                <strong>{{ app.label }}</strong>
                <small>{{ app.simulationIds.length }} endpoint{{ app.simulationIds.length === 1 ? '' : 's' }}</small>
              </th>
              <td v-for="plantel in visiblePlanteles" :key="`${app.id}-${plantel}`">
                <button class="matrix-cell" :class="cellClass(app.id, plantel)" type="button" @click="openCell(app.id, plantel)">
                  <span class="dot" :class="cellStatus(app.id, plantel)" />
                  <span class="cell-main">{{ cellLabel(app.id, plantel) }}</span>
                  <small>{{ cellMeta(app.id, plantel) }}</small>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!visiblePlanteles.length" class="empty">No hay planteles que coincidan con “{{ plantelQuery }}”.</div>
    </section>

    <Teleport to="body">
      <div v-if="drawerOpen" class="drawer-backdrop" @click.self="closeDrawer">
        <aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalle DX">
          <header class="drawer-head">
            <div>
              <p class="eyebrow">{{ selectedPlantel }}</p>
              <h2>{{ selectedAppResult?.app || selectedApp?.label }}</h2>
              <p class="drawer-status"><span class="dot" :class="selectedAppResult?.status || 'idle'" />{{ drawerStatusText }}</p>
            </div>
            <button class="icon-btn" type="button" aria-label="Cerrar" @click="closeDrawer">×</button>
          </header>

          <div class="endpoint-tabs">
            <button
              v-for="endpoint in selectedAppResult?.endpoints || []"
              :key="endpoint.simulationId"
              type="button"
              :class="{ active: selectedEndpoint?.simulationId === endpoint.simulationId }"
              @click="selectEndpoint(endpoint)"
            >
              <span class="dot" :class="endpoint.ok ? 'ok' : 'error'" />
              <span>{{ endpoint.label }}</span>
              <small>{{ endpoint.status || '—' }}</small>
            </button>
          </div>

          <section v-if="selectedEndpoint" class="endpoint-info">
            <div class="endpoint-line">
              <code>{{ selectedEndpoint.request }}</code>
              <button class="ghost" type="button" :disabled="detailLoading" @click="loadFullData(selectedEndpoint)">{{ detailLoading ? 'Cargando…' : 'Actualizar datos' }}</button>
            </div>
            <div class="mini-metrics">
              <span><b>{{ selectedEndpoint.status || '—' }}</b> HTTP</span>
              <span><b>{{ selectedEndpoint.latencyMs || 0 }} ms</b></span>
              <span><b>{{ activeResult?.rowCount ?? selectedEndpoint.rowCount ?? 0 }}</b> filas</span>
              <span><b>{{ activeResult?.source || selectedEndpoint.source || '—' }}</b> source</span>
            </div>
            <p v-if="selectedEndpoint.error" class="error-box"><b>{{ selectedEndpoint.error.code }}</b> · {{ selectedEndpoint.error.message }}</p>
            <p v-if="selectedEndpoint.params" class="params">{{ compactParams(selectedEndpoint.params) }}</p>
          </section>

          <div class="drawer-view-tabs" v-if="selectedEndpoint">
            <button type="button" :class="{ active: drawerView === 'proof' }" @click="drawerView = 'proof'">Proof</button>
            <button type="button" :class="{ active: drawerView === 'data' }" @click="drawerView = 'data'">Datos</button>
          </div>
          <DxProofPanel v-if="drawerView === 'proof' && selectedEndpoint" :rows="activeRows" :plantel="selectedPlantel" :ciclo="cycle" :simulation-id="selectedEndpoint.simulationId" />
          <section v-else class="data-section">
            <div class="data-toolbar">
              <input v-model="rowFilter" placeholder="Buscar cualquier string en las filas" aria-label="Buscar en datos">
              <select v-model.number="pageSize" aria-label="Filas por página">
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
              <button class="ghost" type="button" :disabled="!filteredRows.length" @click="downloadCsv">CSV</button>
            </div>

            <div v-if="detailLoading" class="loading-box">Consultando datos reales…</div>
            <div v-else-if="filteredRows.length" class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th v-for="column in tableColumns" :key="column">{{ column }}</th></tr></thead>
                <tbody>
                  <tr v-for="(row, index) in pageRows" :key="index">
                    <td v-for="column in tableColumns" :key="column" :title="cell(row?.[column])">{{ cell(row?.[column]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty compact">Sin filas para mostrar.</div>

            <footer class="pager" v-if="filteredRows.length">
              <span>{{ filteredRows.length }} coincidencias</span>
              <div>
                <button class="ghost" type="button" :disabled="page <= 1" @click="page--">Anterior</button>
                <span>{{ page }} / {{ totalPages }}</span>
                <button class="ghost" type="button" :disabled="page >= totalPages" @click="page++">Siguiente</button>
              </div>
            </footer>
          </section>
        </aside>
      </div>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

type MatrixCell = { appId: string; app: string; status: 'ok' | 'partial' | 'error'; okEndpoints: number; totalEndpoints: number; latencyMs: number; rowCount: number; endpoints: any[] }

const catalog = ref<any>(null)
const cycle = ref('')
const plantelQuery = ref('')
const autoRunning = ref(false)
const progress = reactive({ done: 0, total: 0 })
const matrixResults = reactive<Record<string, any>>({})
const runningPlanteles = reactive<Record<string, boolean>>({})

const drawerOpen = ref(false)
const selectedPlantel = ref('')
const selectedAppId = ref('')
const selectedEndpoint = ref<any>(null)
const detailLoading = ref(false)
const detailCache = reactive<Record<string, any>>({})
const rowFilter = ref('')
const drawerView = ref<'proof' | 'data'>('proof')
const page = ref(1)
const pageSize = ref(25)

onMounted(async () => {
  catalog.value = await $fetch('/api/control-escolar/dx-api-lab/catalog')
  cycle.value = catalog.value?.defaults?.ciclo || ''
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeDrawer() }
const apps = computed(() => catalog.value?.apps || [])
const planteles = computed<string[]>(() => catalog.value?.planteles || [])
const visiblePlanteles = computed(() => {
  const needle = plantelQuery.value.trim().toUpperCase()
  if (!needle) return planteles.value
  return planteles.value.filter(plantel => plantel.includes(needle))
})

const getCell = (appId: string, plantel: string): MatrixCell | null => matrixResults[plantel]?.apps?.find((item: MatrixCell) => item.appId === appId) || null
const cellStatus = (appId: string, plantel: string) => runningPlanteles[plantel] ? 'running' : getCell(appId, plantel)?.status || 'idle'
const cellClass = (appId: string, plantel: string) => `state-${cellStatus(appId, plantel)}`
const cellLabel = (appId: string, plantel: string) => {
  if (runningPlanteles[plantel]) return 'Probando'
  const value = getCell(appId, plantel)
  if (!value) return '—'
  return `${value.okEndpoints}/${value.totalEndpoints}`
}
const cellMeta = (appId: string, plantel: string) => {
  if (runningPlanteles[plantel]) return 'en tiempo real'
  const value = getCell(appId, plantel)
  if (!value) return 'sin prueba'
  return `${value.latencyMs} ms`
}

const allCells = computed(() => Object.values(matrixResults).flatMap((result: any) => result?.apps || []))
const stats = computed(() => ({
  ok: allCells.value.filter((cell: any) => cell.status === 'ok').length,
  partial: allCells.value.filter((cell: any) => cell.status === 'partial').length,
  error: allCells.value.filter((cell: any) => cell.status === 'error').length
}))

const runPlantel = async (plantel: string) => {
  runningPlanteles[plantel] = true
  try {
    matrixResults[plantel] = await $fetch('/api/control-escolar/dx-api-lab/auto', {
      method: 'POST',
      body: { plantel, ciclo: cycle.value }
    })
  } catch (error: any) {
    matrixResults[plantel] = {
      plantel,
      ciclo: cycle.value,
      apps: apps.value.map((app: any) => ({
        appId: app.id,
        app: app.label,
        status: 'error',
        okEndpoints: 0,
        totalEndpoints: app.simulationIds.length,
        latencyMs: 0,
        rowCount: 0,
        endpoints: app.simulationIds.map((simulationId: string) => ({ simulationId, label: simulationId, ok: false, status: error?.statusCode || 500, error: { code: 'DX_AUTO_FAILED', message: error?.message || 'Auto-DX falló.' }, params: { plantel, ciclo: cycle.value } }))
      }))
    }
  } finally {
    runningPlanteles[plantel] = false
    progress.done += 1
  }
}

const runAutoDx = async () => {
  if (autoRunning.value || !catalog.value) return
  const targets = [...visiblePlanteles.value]
  if (!targets.length) return
  autoRunning.value = true
  progress.done = 0
  progress.total = targets.length
  const queue = [...targets]
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) {
      const plantel = queue.shift()
      if (plantel) await runPlantel(plantel)
    }
  })
  await Promise.all(workers)
  autoRunning.value = false
}

const selectedApp = computed(() => apps.value.find((app: any) => app.id === selectedAppId.value) || null)
const selectedAppResult = computed(() => getCell(selectedAppId.value, selectedPlantel.value))
const drawerStatusText = computed(() => {
  const value = selectedAppResult.value
  if (!value) return 'Sin prueba'
  if (value.status === 'ok') return `${value.okEndpoints}/${value.totalEndpoints} endpoints OK`
  if (value.status === 'partial') return `${value.okEndpoints}/${value.totalEndpoints} endpoints OK`
  return 'Endpoints con error'
})

const openCell = (appId: string, plantel: string) => {
  selectedAppId.value = appId
  selectedPlantel.value = plantel
  selectedEndpoint.value = selectedAppResult.value?.endpoints?.[0] || null
  drawerOpen.value = true
  drawerView.value = 'proof'
  rowFilter.value = ''
  page.value = 1
  if (selectedEndpoint.value) void loadFullData(selectedEndpoint.value)
}
const closeDrawer = () => { drawerOpen.value = false }

const selectEndpoint = (endpoint: any) => {
  selectedEndpoint.value = endpoint
  drawerView.value = 'proof'
  rowFilter.value = ''
  page.value = 1
  void loadFullData(endpoint)
}

const detailKey = (endpoint: any) => `${selectedPlantel.value}:${cycle.value}:${endpoint?.simulationId || endpoint?.endpointId || ''}`
const loadFullData = async (endpoint: any) => {
  if (!endpoint?.simulationId) return
  const key = detailKey(endpoint)
  if (detailCache[key]) return
  detailLoading.value = true
  try {
    detailCache[key] = await $fetch('/api/control-escolar/dx-api-lab/run', {
      method: 'POST',
      body: { simulationId: endpoint.simulationId, params: endpoint.params || { plantel: selectedPlantel.value, ciclo: cycle.value } }
    })
  } catch (error: any) {
    detailCache[key] = error?.data || { ok: false, rows: [], rowCount: 0, error: { code: 'DX_DETAIL_FAILED', message: error?.message || 'No se pudo consultar el endpoint.' } }
  } finally {
    detailLoading.value = false
  }
}

const activeResult = computed(() => selectedEndpoint.value ? detailCache[detailKey(selectedEndpoint.value)] || null : null)
const activeRows = computed<any[]>(() => {
  if (Array.isArray(activeResult.value?.rows)) return activeResult.value.rows
  return Array.isArray(selectedEndpoint.value?.previewRows) ? selectedEndpoint.value.previewRows : []
})
const filteredRows = computed(() => {
  const needle = rowFilter.value.trim().toLocaleLowerCase('es')
  if (!needle) return activeRows.value
  return activeRows.value.filter(row => {
    try { return JSON.stringify(row).toLocaleLowerCase('es').includes(needle) } catch { return String(row).toLocaleLowerCase('es').includes(needle) }
  })
})
watch([rowFilter, pageSize], () => { page.value = 1 })
const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))
watch(totalPages, value => { if (page.value > value) page.value = value })
const pageRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const tableColumns = computed(() => {
  const keys = new Set<string>()
  for (const row of filteredRows.value.slice(0, 100)) {
    if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(key => keys.add(key))
    else keys.add('value')
    if (keys.size >= 16) break
  }
  return Array.from(keys).slice(0, 16)
})

const cell = (value: any) => {
  if (value == null) return ''
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}
const compactParams = (params: Record<string, any>) => Object.entries(params || {}).filter(([, value]) => value !== '').map(([key, value]) => `${key}=${value}`).join(' · ')
const csvEscape = (value: any) => `"${cell(value).replace(/"/g, '""')}"`
const downloadCsv = () => {
  const columns = Array.from(new Set(filteredRows.value.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : ['value'])))
  const lines = [columns.map(csvEscape).join(','), ...filteredRows.value.map(row => columns.map(column => csvEscape(row?.[column])).join(','))]
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `aurora-dx-${selectedPlantel.value}-${selectedEndpoint.value?.simulationId || 'datos'}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
:global(body){margin:0;background:#f6f7f9;color:#182230;font-family:Montserrat,system-ui,-apple-system,sans-serif}.dx-shell{max-width:1800px;margin:0 auto;padding:24px}.topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:14px}.eyebrow{margin:0 0 5px;font-size:10px;font-weight:800;letter-spacing:.15em;color:#7c8799}.topbar h1,.drawer h2{margin:0;font-family:Fredoka,Montserrat,sans-serif}.topbar h1{font-size:30px}.actions{display:flex;align-items:flex-end;gap:10px}.cycle-field,.plantel-filter{display:block;font-size:10px;font-weight:800;color:#7c8799;text-transform:uppercase;letter-spacing:.06em}.cycle-field input,.search-select input,.data-toolbar input,.data-toolbar select{box-sizing:border-box;border:1px solid #d8dde6;border-radius:10px;background:#fff;color:#182230;font:inherit}.cycle-field input{display:block;width:124px;padding:9px 10px;margin-top:4px}.search-select{position:relative;margin-top:4px}.search-select input{width:190px;padding:9px 34px 9px 10px}.clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0;background:transparent;font-size:18px;color:#98a2b3;cursor:pointer}.auto{display:flex;align-items:center;gap:8px;border:0;border-radius:11px;background:#172033;color:#fff;padding:11px 16px;font:inherit;font-weight:800;cursor:pointer}.auto:disabled{opacity:.55;cursor:not-allowed}.auto-dot{width:8px;height:8px;border-radius:50%;background:#65d6a6}.pulse{animation:pulse 1s infinite}.summary-row{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}.summary-chip{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e4e7ec;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:700}.summary-chip.muted{color:#7c8799;font-weight:600}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#c5ccd7;flex:0 0 auto}.dot.ok{background:#12a66a}.dot.partial{background:#f5a524}.dot.error{background:#e5484d}.dot.running{background:#5b8def;animation:pulse 1s infinite}.dot.idle{background:#c5ccd7}.matrix-card{background:#fff;border:1px solid #e4e7ec;border-radius:15px;overflow:hidden;box-shadow:0 2px 8px rgba(16,24,40,.035)}.matrix-wrap{overflow:auto}.matrix{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:11px}.matrix th,.matrix td{border-right:1px solid #edf0f4;border-bottom:1px solid #edf0f4;padding:0}.matrix tr:last-child th,.matrix tr:last-child td{border-bottom:0}.matrix th:last-child,.matrix td:last-child{border-right:0}.app-col{position:sticky;left:0;z-index:2;background:#fff;min-width:190px;text-align:left;padding:12px 14px!important}.matrix thead .app-col{z-index:4;background:#f8fafc}.plantel-head{position:sticky;top:0;z-index:3;background:#f8fafc;min-width:115px;padding:10px!important;text-align:center;color:#667085;font-size:10px;letter-spacing:.05em}.app-name strong,.app-name small{display:block}.app-name strong{font-size:12px}.app-name small{margin-top:3px;color:#98a2b3;font-weight:500}.matrix-cell{width:100%;min-width:115px;min-height:68px;border:0;background:#fff;padding:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;color:#344054}.matrix-cell:hover{background:#f8fafc}.matrix-cell .cell-main{font-weight:800}.matrix-cell small{font-size:9px;color:#98a2b3}.state-ok{background:#f3fbf7}.state-partial{background:#fffaf0}.state-error{background:#fff5f5}.empty{padding:36px;text-align:center;color:#98a2b3;font-size:12px}.empty.compact{padding:20px}.drawer-backdrop{position:fixed;inset:0;background:rgba(16,24,40,.28);z-index:1000;display:flex;justify-content:flex-end}.drawer{width:min(860px,92vw);height:100%;background:#fff;box-shadow:-18px 0 40px rgba(16,24,40,.12);padding:20px;box-sizing:border-box;overflow:auto}.drawer-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.drawer h2{font-size:25px}.drawer-status{display:flex;align-items:center;gap:6px;margin:5px 0 0;color:#667085;font-size:11px}.icon-btn{border:0;background:#f2f4f7;border-radius:9px;width:34px;height:34px;font-size:20px;cursor:pointer}.endpoint-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;margin:18px 0}.endpoint-tabs button{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6px;border:1px solid #e4e7ec;background:#fff;border-radius:10px;padding:9px;text-align:left;cursor:pointer;font:inherit;font-size:11px}.endpoint-tabs button.active{border-color:#172033;box-shadow:0 0 0 1px #172033}.endpoint-tabs small{color:#98a2b3}.endpoint-info{border-top:1px solid #edf0f4;border-bottom:1px solid #edf0f4;padding:13px 0}.endpoint-line{display:flex;justify-content:space-between;align-items:center;gap:12px}.endpoint-line code{font-size:11px;word-break:break-all}.mini-metrics{display:flex;gap:12px;flex-wrap:wrap;margin-top:9px;color:#667085;font-size:10px}.mini-metrics b{color:#344054}.params{font-size:10px;color:#7c8799;margin:8px 0 0;word-break:break-all}.error-box{background:#fff2f2;color:#b42318;border-radius:9px;padding:9px 10px;font-size:11px}.ghost{border:1px solid #d8dde6;background:#fff;border-radius:9px;padding:7px 9px;font:inherit;font-size:10px;font-weight:700;cursor:pointer}.ghost:disabled{opacity:.45}.drawer-view-tabs{display:flex;gap:5px;margin-top:14px;border-bottom:1px solid #edf0f4}.drawer-view-tabs button{border:0;background:transparent;padding:8px 10px;font:inherit;font-size:10px;font-weight:800;color:#98a2b3;cursor:pointer;border-bottom:2px solid transparent}.drawer-view-tabs button.active{color:#172033;border-bottom-color:#172033}.data-section{margin-top:14px}.data-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 80px auto;gap:8px}.data-toolbar input,.data-toolbar select{padding:9px 10px;width:100%}.data-table-wrap{overflow:auto;border:1px solid #e4e7ec;border-radius:10px;margin-top:10px;max-height:55vh}.data-table{border-collapse:collapse;width:100%;font-size:10px}.data-table th,.data-table td{padding:8px 9px;border-bottom:1px solid #edf0f4;text-align:left;white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis}.data-table th{position:sticky;top:0;background:#f8fafc;color:#667085;z-index:1}.pager{display:flex;justify-content:space-between;align-items:center;margin-top:10px;color:#667085;font-size:10px}.pager>div{display:flex;gap:8px;align-items:center}.loading-box{padding:28px;text-align:center;color:#667085;font-size:11px}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@media(max-width:900px){.topbar{align-items:stretch;flex-direction:column}.actions{align-items:stretch;flex-wrap:wrap}.cycle-field input,.search-select input{width:100%}.cycle-field,.plantel-filter{flex:1;min-width:150px}.auto{justify-content:center}.dx-shell{padding:14px}.app-col{min-width:155px}.drawer{width:100vw}.data-toolbar{grid-template-columns:1fr 72px auto}}@media(max-width:560px){.actions{display:grid;grid-template-columns:1fr 1fr}.auto{grid-column:1/-1}.summary-row{gap:5px}.topbar h1{font-size:25px}.endpoint-line{align-items:flex-start;flex-direction:column}.data-toolbar{grid-template-columns:1fr 72px}.data-toolbar .ghost{grid-column:1/-1}.pager{align-items:flex-start;flex-direction:column;gap:8px}}
</style>
