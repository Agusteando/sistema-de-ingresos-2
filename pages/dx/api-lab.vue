<template>
  <main class="dx-shell">
    <header class="dx-header">
      <div>
        <p class="eyebrow">AURORA · DX</p>
        <h1>API Lab</h1>
        <p class="sub">Contratos externos, simulaciones reales y payloads.</p>
      </div>
      <div class="header-actions">
        <button class="secondary" :disabled="autoTesting || !catalog" @click="autoTestEndpoints">{{ autoTesting ? 'Probando…' : 'Auto-test GET seguros' }}</button>
        <span class="hidden-badge">Ruta oculta</span>
      </div>
    </header>

    <section class="controls card">
      <label>Plantel<input v-model.trim="params.plantel" placeholder="PREEM"></label>
      <label>Ciclo<input v-model.trim="params.ciclo" placeholder="2026-2027"></label>
      <label>Matrícula<input v-model.trim="params.matricula" placeholder="Opcional"></label>
      <label>Búsqueda<input v-model.trim="params.q" placeholder="Nombre / matrícula"></label>
      <label>Estado<input v-model.trim="params.status" placeholder="inscrito"></label>
      <label>Límite<input v-model.trim="params.limit" inputmode="numeric" placeholder="500"></label>
    </section>

    <section class="workspace">
      <aside class="card side">
        <div class="mode-switch">
          <button :class="{ active: mode === 'simulation' }" @click="mode = 'simulation'">Apps</button>
          <button :class="{ active: mode === 'endpoint' }" @click="mode = 'endpoint'">Endpoints</button>
        </div>

        <template v-if="mode === 'simulation'">
          <button
            v-for="sim in catalog?.simulations || []"
            :key="sim.id"
            class="pick"
            :class="{ selected: selectedSimulation === sim.id }"
            @click="selectedSimulation = sim.id"
          >
            <span>{{ sim.app }}</span>
            <strong>{{ sim.label }}</strong>
            <small>{{ sim.verifiedDirect ? 'Llamada directa verificada' : 'Contrato Aurora · no llamada directa detectada' }}</small>
          </button>
        </template>
        <template v-else>
          <button
            v-for="endpoint in catalog?.endpoints || []"
            :key="endpoint.id"
            class="pick"
            :class="{ selected: selectedEndpoint === endpoint.id }"
            @click="selectedEndpoint = endpoint.id"
          >
            <span><b :class="methodClass(endpoint.method)">{{ endpoint.method }}</b> {{ endpoint.group }}</span>
            <strong>{{ endpoint.label }}</strong>
            <small>{{ endpoint.path }}</small>
          </button>
        </template>
      </aside>

      <section class="card runner">
        <div v-if="activeItem" class="runner-head">
          <div>
            <p class="eyebrow">{{ mode === 'simulation' ? activeSimulation?.app : activeEndpoint?.group }}</p>
            <h2>{{ activeItem.label }}</h2>
            <code>{{ activeEndpoint?.method }} {{ activeEndpoint?.path }}</code>
            <p class="note">{{ mode === 'simulation' ? activeSimulation?.note : activeEndpoint?.description }}</p>
          </div>
          <button class="primary" :disabled="running || !activeEndpoint?.runnable" @click="runCurrent">{{ running ? 'Ejecutando…' : 'Ejecutar' }}</button>
        </div>
        <div v-else class="empty">Cargando catálogo…</div>
        <p v-if="activeEndpoint && !activeEndpoint.runnable" class="blocked">{{ activeEndpoint.reason }}</p>

        <div v-if="result" class="result">
          <div class="metrics">
            <div><span>HTTP</span><strong :class="result.ok ? 'ok' : 'bad'">{{ result.status }}</strong></div>
            <div><span>Latencia</span><strong>{{ result.latencyMs }} ms</strong></div>
            <div><span>Filas</span><strong>{{ result.rowCount }}</strong></div>
            <div><span>Páginas</span><strong>{{ result.pages || 1 }}</strong></div>
            <div><span>Source</span><strong>{{ result.source ?? '—' }}</strong></div>
            <div><span>Fallback</span><strong>{{ result.fallback ?? '—' }}</strong></div>
          </div>
          <div class="request-line"><code>{{ result.request }}</code><span>{{ result.header }}</span></div>
          <p v-if="result.error" class="error-box"><b>{{ result.error.code }}</b> · {{ result.error.message }}</p>
          <p v-if="result.truncated" class="warning">Vista limitada a 5,000 filas / 20 páginas para proteger operación.</p>

          <div class="table-toolbar">
            <input v-model="rowFilter" placeholder="Buscar en cualquier columna / string match">
            <span>{{ filteredRows.length }} coincidencias</span>
            <button class="secondary" :disabled="!filteredRows.length" @click="downloadCsv">CSV</button>
          </div>
          <div class="table-wrap" v-if="filteredRows.length">
            <table>
              <thead><tr><th v-for="column in tableColumns" :key="column">{{ column }}</th></tr></thead>
              <tbody>
                <tr v-for="(row, index) in visibleRows" :key="index">
                  <td v-for="column in tableColumns" :key="column" :title="cell(row?.[column])">{{ cell(row?.[column]) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="filteredRows.length > visibleRows.length" class="table-foot">Mostrando 200 de {{ filteredRows.length }}. El CSV incluye todas las coincidencias.</p>
          </div>
          <div v-else class="empty compact">Sin filas para mostrar.</div>

          <details class="payload">
            <summary>Payload JSON</summary>
            <pre>{{ rawPayloadText }}</pre>
          </details>
        </div>
      </section>
    </section>

    <section class="card inventory">
      <div class="inventory-head">
        <div><p class="eyebrow">INVENTARIO</p><h2>API externa disponible</h2></div>
        <input v-model="endpointFilter" placeholder="Filtrar endpoint">
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Método</th><th>Grupo</th><th>Endpoint</th><th>Prueba</th><th>Estado</th></tr></thead>
          <tbody>
            <tr v-for="endpoint in filteredEndpoints" :key="endpoint.id">
              <td><b :class="methodClass(endpoint.method)">{{ endpoint.method }}</b></td>
              <td>{{ endpoint.group }}</td>
              <td><code>{{ endpoint.path }}</code><small class="desc">{{ endpoint.description }}</small></td>
              <td>
                <button v-if="endpoint.runnable" class="mini" :disabled="runningEndpoint === endpoint.id" @click="runEndpoint(endpoint.id)">Probar</button>
                <span v-else class="muted">Bloqueado</span>
              </td>
              <td><span v-if="testStatus[endpoint.id]" :class="testStatus[endpoint.id].ok ? 'status-ok' : 'status-bad'">{{ testStatus[endpoint.id].status }} · {{ testStatus[endpoint.id].latencyMs }}ms</span><span v-else>—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const catalog = ref<any>(null)
const mode = ref<'simulation' | 'endpoint'>('simulation')
const selectedSimulation = ref('lista-roster')
const selectedEndpoint = ref('school-cycle')
const running = ref(false)
const runningEndpoint = ref('')
const autoTesting = ref(false)
const result = ref<any>(null)
const rowFilter = ref('')
const endpointFilter = ref('')
const testStatus = reactive<Record<string, any>>({})

const defaultCycle = () => {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

const params = reactive<Record<string, string>>({ plantel: 'PREEM', ciclo: defaultCycle(), matricula: '', q: '', status: 'inscrito', limit: '500', fresh: '1' })

onMounted(async () => {
  catalog.value = await $fetch('/api/control-escolar/dx-api-lab/catalog')
  Object.assign(params, catalog.value?.defaults || {})
})

const activeSimulation = computed(() => catalog.value?.simulations?.find((item: any) => item.id === selectedSimulation.value) || null)
const activeEndpoint = computed(() => {
  const endpointId = mode.value === 'simulation' ? activeSimulation.value?.endpointId : selectedEndpoint.value
  return catalog.value?.endpoints?.find((item: any) => item.id === endpointId) || null
})
const activeItem = computed(() => mode.value === 'simulation' ? activeSimulation.value : activeEndpoint.value)

const execute = async (payload: any) => await $fetch<any>('/api/control-escolar/dx-api-lab/run', { method: 'POST', body: payload })

const runCurrent = async () => {
  if (!activeEndpoint.value?.runnable) return
  running.value = true
  rowFilter.value = ''
  try {
    result.value = await execute(mode.value === 'simulation'
      ? { simulationId: selectedSimulation.value, params: { ...params } }
      : { endpointId: selectedEndpoint.value, params: { ...params } })
  } catch (error: any) {
    result.value = error?.data || { ok: false, status: error?.statusCode || 500, rows: [], rowCount: 0, error: { code: 'DX_UI_ERROR', message: error?.message || 'Error DX' } }
  } finally {
    running.value = false
  }
}

const runEndpoint = async (endpointId: string) => {
  runningEndpoint.value = endpointId
  try {
    const value = await execute({ endpointId, params: { ...params } })
    testStatus[endpointId] = value
    result.value = value
    mode.value = 'endpoint'
    selectedEndpoint.value = endpointId
    rowFilter.value = ''
  } catch (error: any) {
    testStatus[endpointId] = error?.data || { ok: false, status: error?.statusCode || 500, latencyMs: 0 }
  } finally {
    runningEndpoint.value = ''
  }
}

const autoTestEndpoints = async () => {
  if (!catalog.value) return
  autoTesting.value = true
  try {
    for (const endpoint of catalog.value.endpoints.filter((item: any) => item.runnable && item.autoTest)) {
      const value = await execute({ endpointId: endpoint.id, params: { ...params } })
      testStatus[endpoint.id] = value
    }
  } finally {
    autoTesting.value = false
  }
}

const rows = computed<any[]>(() => Array.isArray(result.value?.rows) ? result.value.rows : [])
const filteredRows = computed(() => {
  const needle = rowFilter.value.trim().toLocaleLowerCase('es')
  if (!needle) return rows.value
  return rows.value.filter(row => {
    try { return JSON.stringify(row).toLocaleLowerCase('es').includes(needle) } catch { return String(row).toLocaleLowerCase('es').includes(needle) }
  })
})
const visibleRows = computed(() => filteredRows.value.slice(0, 200))
const tableColumns = computed(() => {
  const keys = new Set<string>()
  for (const row of filteredRows.value.slice(0, 50)) {
    if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(key => keys.add(key))
    else keys.add('value')
    if (keys.size >= 14) break
  }
  return Array.from(keys).slice(0, 14)
})

const cell = (value: any) => {
  if (value == null) return ''
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

const csvEscape = (value: any) => `"${cell(value).replace(/"/g, '""')}"`
const downloadCsv = () => {
  const allColumns = Array.from(new Set(filteredRows.value.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : ['value'])))
  const lines = [allColumns.map(csvEscape).join(','), ...filteredRows.value.map(row => allColumns.map(column => csvEscape(row?.[column])).join(','))]
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `aurora-dx-${result.value?.simulationId || result.value?.endpointId || 'data'}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

const rawPayloadText = computed(() => {
  let text = ''
  try { text = JSON.stringify(result.value?.rawPayload ?? null, null, 2) } catch { text = String(result.value?.rawPayload ?? '') }
  return text.length > 120000 ? `${text.slice(0, 120000)}\n… payload recortado solo en vista` : text
})

const filteredEndpoints = computed(() => {
  const needle = endpointFilter.value.trim().toLocaleLowerCase('es')
  if (!needle) return catalog.value?.endpoints || []
  return (catalog.value?.endpoints || []).filter((item: any) => `${item.method} ${item.group} ${item.label} ${item.path}`.toLocaleLowerCase('es').includes(needle))
})

const methodClass = (method: string) => `method method-${String(method || '').toLowerCase()}`
</script>

<style scoped>
:global(body){margin:0;background:#f5f7fa;color:#172033;font-family:Montserrat,system-ui,-apple-system,sans-serif}.dx-shell{max-width:1500px;margin:0 auto;padding:28px}.dx-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px}.eyebrow{margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.14em;color:#667085}.dx-header h1,.runner h2,.inventory h2{margin:0;font-family:Fredoka,Montserrat,sans-serif}.dx-header h1{font-size:34px}.sub,.note{margin:6px 0 0;color:#667085}.header-actions{display:flex;align-items:center;gap:10px}.hidden-badge{font-size:12px;padding:7px 10px;border:1px solid #d0d5dd;border-radius:999px;color:#667085}.card{background:#fff;border:1px solid #e4e7ec;border-radius:16px;box-shadow:0 2px 8px rgba(16,24,40,.04)}.controls{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;padding:14px;margin-bottom:16px}.controls label{font-size:11px;font-weight:700;color:#667085}.controls input,.table-toolbar input,.inventory-head input{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #d0d5dd;border-radius:9px;padding:9px 10px;font:inherit;color:#172033;background:#fff}.workspace{display:grid;grid-template-columns:310px minmax(0,1fr);gap:16px}.side{padding:10px;max-height:690px;overflow:auto}.mode-switch{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;background:#f2f4f7;border-radius:10px;margin-bottom:8px}.mode-switch button{border:0;background:transparent;padding:8px;border-radius:8px;font-weight:700;color:#667085}.mode-switch button.active{background:#fff;color:#172033;box-shadow:0 1px 3px rgba(16,24,40,.12)}.pick{width:100%;text-align:left;border:0;border-radius:10px;background:transparent;padding:10px;margin:2px 0;color:#344054}.pick:hover,.pick.selected{background:#f2f4f7}.pick span,.pick strong,.pick small{display:block}.pick span{font-size:11px;color:#667085}.pick strong{font-size:13px;margin:3px 0}.pick small{font-size:10px;color:#98a2b3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.runner{padding:20px;min-width:0}.runner-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.runner h2{font-size:24px;margin-bottom:5px}.runner code,.inventory code,.request-line code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.primary,.secondary,.mini{border-radius:9px;font:inherit;font-weight:700;cursor:pointer}.primary{border:0;background:#172033;color:#fff;padding:10px 16px}.secondary{border:1px solid #d0d5dd;background:#fff;color:#344054;padding:8px 12px}.mini{border:1px solid #d0d5dd;background:#fff;padding:5px 8px;font-size:11px}.primary:disabled,.secondary:disabled,.mini:disabled{opacity:.45;cursor:not-allowed}.blocked,.error-box,.warning{padding:10px 12px;border-radius:9px;font-size:12px}.blocked,.warning{background:#fffaeb;color:#93370d}.error-box{background:#fef3f2;color:#b42318}.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:18px 0 10px}.metrics div{background:#f8fafc;border:1px solid #eaecf0;border-radius:10px;padding:10px;min-width:0}.metrics span,.metrics strong{display:block}.metrics span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#98a2b3}.metrics strong{font-size:13px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ok,.status-ok{color:#067647}.bad,.status-bad{color:#b42318}.request-line{display:flex;justify-content:space-between;gap:10px;color:#667085;font-size:11px}.table-toolbar{display:grid;grid-template-columns:minmax(200px,1fr) auto auto;align-items:center;gap:10px;margin-top:16px}.table-toolbar input{margin:0}.table-toolbar span{font-size:11px;color:#667085}.table-wrap{overflow:auto;margin-top:10px;border:1px solid #eaecf0;border-radius:10px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{padding:8px 10px;border-bottom:1px solid #eaecf0;text-align:left;vertical-align:top;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}th{position:sticky;top:0;background:#f8fafc;color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.04em}tr:last-child td{border-bottom:0}.table-foot{padding:0 10px 10px;color:#667085;font-size:11px}.payload{margin-top:14px;border-top:1px solid #eaecf0;padding-top:12px}.payload summary{cursor:pointer;font-size:12px;font-weight:700}.payload pre{max-height:420px;overflow:auto;background:#101828;color:#e4e7ec;border-radius:10px;padding:14px;font-size:11px;line-height:1.45}.empty{padding:50px;text-align:center;color:#98a2b3}.empty.compact{padding:24px}.inventory{margin-top:16px;padding:16px}.inventory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.inventory-head h2{font-size:20px}.inventory-head input{width:320px;margin:0}.desc{display:block;color:#98a2b3;margin-top:3px}.muted{color:#98a2b3}.method{font-size:10px;padding:3px 5px;border-radius:5px;background:#f2f4f7;color:#475467}.method-get{background:#ecfdf3;color:#067647}.method-post,.method-put,.method-patch{background:#fff6ed;color:#b54708}@media(max-width:1000px){.controls{grid-template-columns:repeat(3,1fr)}.workspace{grid-template-columns:1fr}.side{max-height:300px}.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:640px){.dx-shell{padding:16px}.dx-header,.runner-head,.inventory-head{align-items:stretch;flex-direction:column}.controls{grid-template-columns:repeat(2,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}.inventory-head input{width:100%}.request-line{flex-direction:column}}
</style>
