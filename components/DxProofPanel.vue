<template>
  <section class="proof-panel">
    <header class="proof-head">
      <div><strong>Proof · padrón académico</strong><p>Conteos calculados en este navegador con filas reales.</p></div>
      <span class="proof-state" :class="proofClass">{{ proofLabel }}</span>
    </header>
    <div class="proof-metrics">
      <div><span>Endpoint</span><b>{{ endpointRows.length }}</b></div>
      <div><span>Control Escolar</span><b>{{ baselineEnrolledRows.length }}</b></div>
      <div v-if="strictParity"><span>Faltan</span><b>{{ missingMatriculas }}</b></div>
      <div v-if="strictParity"><span>Sobran</span><b>{{ extraMatriculas }}</b></div>
      <div><span>Grados distintos</span><b>{{ gradeDiffs }}</b></div>
      <div><span>Grupos distintos</span><b>{{ distributionDiffs }}</b></div>
    </div>
    <p v-if="loading" class="proof-note">Consultando el padrón canónico de Control Escolar…</p>
    <p v-else-if="error" class="proof-error">{{ error }}</p>
    <p v-else-if="!strictParity" class="proof-note">Control Escolar se muestra como referencia; este endpoint no promete el mismo universo que Lista de Caritas.</p>
    <p v-else-if="isExact" class="proof-ok">matches Control Escolar</p>
    <p v-else class="proof-error">Discrepancia detectada. Las tablas muestran exactamente qué grado o grupo difiere.</p>

    <div class="proof-block" v-if="gradeRows.length">
      <strong class="proof-subtitle">Por grado</strong>
      <div class="proof-table-wrap compact">
        <table class="proof-table">
          <thead><tr><th>Grado</th><th>Endpoint</th><th>Control Escolar</th><th>Δ</th></tr></thead>
          <tbody><tr v-for="row in gradeRows" :key="row.key" :class="{ mismatch: row.delta !== 0 }"><td>{{ row.grado }}</td><td>{{ row.endpoint }}</td><td>{{ row.baseline }}</td><td>{{ row.delta > 0 ? `+${row.delta}` : row.delta }}</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="proof-block" v-if="proofRows.length">
      <strong class="proof-subtitle">Por grado + grupo</strong>
      <div class="proof-table-wrap">
        <table class="proof-table">
          <thead><tr><th>Grado</th><th>Grupo</th><th>Endpoint</th><th>Control Escolar</th><th>Δ</th></tr></thead>
          <tbody><tr v-for="row in proofRows" :key="row.key" :class="{ mismatch: row.delta !== 0 }"><td>{{ row.grado }}</td><td>{{ row.grupo }}</td><td>{{ row.endpoint }}</td><td>{{ row.baseline }}</td><td>{{ row.delta > 0 ? `+${row.delta}` : row.delta }}</td></tr></tbody>
        </table>
      </div>
    </div>
    <div v-else-if="!loading" class="proof-empty">Sin filas académicas para contar.</div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ rows: any[]; plantel: string; ciclo: string; simulationId?: string }>()
const loading = ref(false)
const error = ref('')
const baseline = ref<any[]>([])
const strictParity = computed(() => props.simulationId === 'lista-roster')
const endpointRows = computed(() => Array.isArray(props.rows) ? props.rows : [])
const baselineEnrolledRows = computed(() => baseline.value.filter(row => String(row?.enrollmentState || '').trim().toLowerCase() === 'inscrito'))
const clean = (value: unknown) => String(value ?? '').trim()
const gradeKey = (row: any) => clean(row?.grado || row?.grade).toLocaleLowerCase('es') || 'sin grado'
const academicKey = (row: any) => `${gradeKey(row)}\u0000${clean(row?.grupo || row?.group).toLocaleUpperCase('es') || 'SIN GRUPO'}`
const countBy = (rows: any[], keyFor: (row: any) => string) => {
  const counts = new Map<string, number>()
  rows.forEach(row => { const key = keyFor(row); counts.set(key, (counts.get(key) || 0) + 1) })
  return counts
}
const endpointGradeCounts = computed(() => countBy(endpointRows.value, gradeKey))
const baselineGradeCounts = computed(() => countBy(baselineEnrolledRows.value, gradeKey))
const endpointCounts = computed(() => countBy(endpointRows.value, academicKey))
const baselineCounts = computed(() => countBy(baselineEnrolledRows.value, academicKey))
const gradeRows = computed(() => Array.from(new Set([...endpointGradeCounts.value.keys(), ...baselineGradeCounts.value.keys()]))
  .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
  .map(key => { const endpoint = endpointGradeCounts.value.get(key) || 0; const baselineCount = baselineGradeCounts.value.get(key) || 0; return { key, grado: key, endpoint, baseline: baselineCount, delta: endpoint - baselineCount } }))
const proofRows = computed(() => Array.from(new Set([...endpointCounts.value.keys(), ...baselineCounts.value.keys()]))
  .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
  .map(key => { const [grado, grupo] = key.split('\u0000'); const endpoint = endpointCounts.value.get(key) || 0; const baselineCount = baselineCounts.value.get(key) || 0; return { key, grado, grupo, endpoint, baseline: baselineCount, delta: endpoint - baselineCount } }))
const gradeDiffs = computed(() => gradeRows.value.filter(row => row.delta !== 0).length)
const distributionDiffs = computed(() => proofRows.value.filter(row => row.delta !== 0).length)
const matriculaSet = (rows: any[]) => new Set(rows.map(row => clean(row?.matricula).toUpperCase()).filter(Boolean))
const endpointMatriculas = computed(() => matriculaSet(endpointRows.value))
const baselineMatriculas = computed(() => matriculaSet(baselineEnrolledRows.value))
const missingMatriculas = computed(() => Array.from(baselineMatriculas.value).filter(value => !endpointMatriculas.value.has(value)).length)
const extraMatriculas = computed(() => Array.from(endpointMatriculas.value).filter(value => !baselineMatriculas.value.has(value)).length)
const isExact = computed(() => !loading.value && !error.value && endpointRows.value.length === baselineEnrolledRows.value.length && gradeDiffs.value === 0 && distributionDiffs.value === 0 && missingMatriculas.value === 0 && extraMatriculas.value === 0)
const proofClass = computed(() => loading.value ? 'loading' : error.value ? 'error' : strictParity.value ? (isExact.value ? 'ok' : 'error') : 'reference')
const proofLabel = computed(() => loading.value ? 'probando' : error.value ? 'sin baseline' : strictParity.value ? (isExact.value ? 'matches Control Escolar' : `${distributionDiffs.value} diferencias`) : 'referencia')
const loadBaseline = async () => {
  if (!props.plantel || !props.ciclo) return
  loading.value = true
  error.value = ''
  try {
    const result: any = await $fetch('/api/control-escolar/dx-api-lab/proof', { method: 'POST', body: { plantel: props.plantel, ciclo: props.ciclo } })
    baseline.value = Array.isArray(result?.rows) ? result.rows : []
  } catch (caught: any) {
    baseline.value = []
    error.value = caught?.data?.message || caught?.message || 'No se pudo consultar Control Escolar.'
  } finally {
    loading.value = false
  }
}
watch(() => [props.plantel, props.ciclo], loadBaseline, { immediate: true })
</script>

<style scoped>
.proof-panel{margin-top:14px}.proof-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.proof-head strong{font-size:12px}.proof-head p{margin:3px 0 0;color:#7c8799;font-size:10px}.proof-state{border-radius:999px;padding:5px 8px;font-size:9px;font-weight:800}.proof-state.ok{background:#eaf8f1;color:#087a4b}.proof-state.error{background:#fff0f0;color:#b42318}.proof-state.loading,.proof-state.reference{background:#f2f4f7;color:#667085}.proof-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(95px,1fr));gap:7px;margin:12px 0}.proof-metrics div{border:1px solid #e4e7ec;border-radius:10px;padding:9px;background:#fafbfc}.proof-metrics span,.proof-metrics b{display:block}.proof-metrics span{font-size:9px;color:#7c8799}.proof-metrics b{margin-top:3px;font-size:16px}.proof-note,.proof-ok,.proof-error{border-radius:9px;padding:9px 10px;font-size:10px;margin:8px 0}.proof-note{background:#f5f7fa;color:#667085}.proof-ok{background:#eefaf4;color:#087a4b}.proof-error{background:#fff2f2;color:#b42318}.proof-block{margin-top:12px}.proof-subtitle{display:block;margin-bottom:6px;font-size:10px;color:#475467}.proof-table-wrap{overflow:auto;border:1px solid #e4e7ec;border-radius:10px;max-height:42vh}.proof-table-wrap.compact{max-height:24vh}.proof-table{border-collapse:collapse;width:100%;font-size:10px}.proof-table th,.proof-table td{padding:8px 9px;border-bottom:1px solid #edf0f4;text-align:left}.proof-table th{position:sticky;top:0;background:#f8fafc;color:#667085}.proof-table tr.mismatch{background:#fff6f6}.proof-empty{padding:24px;text-align:center;color:#98a2b3;font-size:10px}
</style>
