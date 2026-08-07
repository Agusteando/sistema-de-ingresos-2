<template>
  <div class="progress-report-page">
    <header class="report-toolbar">
      <div class="report-title">
        <span>Control Escolar</span>
        <h1>Avance por plantel</h1>
      </div>

      <div class="report-actions">
        <div class="scope-toggle" role="group" aria-label="Tipo de alumnos">
          <button
            type="button"
            :class="{ active: scopeMode === 'all' }"
            :aria-pressed="scopeMode === 'all'"
            @click="scopeMode = 'all'"
          >
            Todos
          </button>
          <button
            type="button"
            :class="{ active: scopeMode === 'externos' }"
            :aria-pressed="scopeMode === 'externos'"
            @click="scopeMode = 'externos'"
          >
            Externos
          </button>
        </div>

        <label class="cycle-control">
          <span>Ciclo</span>
          <select v-model="selectedCiclo" :disabled="loading" @change="refreshReport">
            <option v-for="ciclo in CICLOS_LIST" :key="ciclo.value" :value="ciclo.value">
              {{ ciclo.label }}
            </option>
          </select>
        </label>

        <button type="button" class="secondary" :disabled="!successfulReports.length || loading" @click="downloadCsv">
          <LucideDownload :size="17" />
          CSV
        </button>
        <button v-if="loading" type="button" class="secondary" @click="cancelLoad">
          <LucideSquare :size="16" />
          Detener
        </button>
        <button v-else type="button" class="primary" :disabled="optionsLoading" @click="refreshReport">
          <LucideRefreshCw :size="17" />
          Actualizar
        </button>
      </div>
    </header>

    <section v-if="queueRows.length" class="load-monitor" aria-live="polite">
      <div class="load-monitor-row">
        <div class="load-state">
          <LucideLoader2 v-if="loading" class="spinning" :size="17" />
          <LucideCheck v-else :size="17" />
          <strong>{{ loading ? currentPlantel || 'Cargando' : loadSummaryLabel }}</strong>
        </div>
        <span>{{ processedCount }}/{{ queueRows.length }}</span>
        <strong>{{ loadingPercent }}%</strong>
      </div>
      <div class="overall-track" role="progressbar" :aria-valuenow="loadingPercent" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ width: `${loadingPercent}%` }"></i>
      </div>
    </section>

    <div v-if="pageError" class="report-error">
      <LucideTriangleAlert :size="19" />
      <strong>{{ pageError }}</strong>
    </div>

    <section class="summary-grid">
      <article class="summary-card">
        <span>Planteles</span>
        <strong>{{ successfulReports.length }}</strong>
      </article>
      <article class="summary-card">
        <span>{{ scopeMode === 'externos' ? 'Externos evaluados' : 'Evaluados' }}</span>
        <strong>{{ formatNumber(globalPopulation.evaluated) }}</strong>
      </article>
      <article class="summary-card is-basic">
        <span>Básico</span>
        <strong>{{ globalBasic.averagePercent }}%</strong>
      </article>
      <article class="summary-card is-advanced">
        <span>Avanzado</span>
        <strong>{{ globalAdvanced.averagePercent }}%</strong>
      </article>
    </section>

    <section class="chart-section">
      <header class="section-heading">
        <h2>Básico</h2>
        <span>{{ scopeMode === 'externos' ? 'Externos' : 'Todos' }}</span>
      </header>

      <div v-if="basicChartRows.length" class="calm-chart" role="img" :aria-label="basicChartAriaLabel">
        <div class="calm-chart-axis" aria-hidden="true">
          <span v-for="tick in chartTicks" :key="tick">{{ tick }}%</span>
        </div>

        <article v-for="row in basicChartRows" :key="row.plantel" class="calm-chart-row">
          <div class="calm-row-head">
            <div class="calm-row-label">
              <strong>{{ row.plantel }}</strong>
              <span>{{ formatNumber(row.evaluated) }}</span>
            </div>
            <small>{{ formatNumber(row.basicCompleteRecords) }}</small>
          </div>

          <div class="calm-bar-track">
            <div class="calm-bar-grid" aria-hidden="true">
              <i v-for="tick in innerGridTicks" :key="tick" :style="{ left: `${tick}%` }"></i>
            </div>
            <div class="calm-bar-fill" :style="{ width: `${row.basic}%` }">
              <span v-if="row.basic >= 18" class="calm-bar-pill">{{ row.basic }}%</span>
            </div>
            <span v-if="row.basic < 18" class="calm-bar-pill is-outside" :style="outsideBarPillStyle(row.basic)">
              {{ row.basic }}%
            </span>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        Sin datos
      </div>
    </section>

    <details v-if="advancedChartRows.length" class="advanced-panel">
      <summary>
        <div class="advanced-panel-title">
          <span>Avanzado</span>
          <strong>{{ globalAdvanced.averagePercent }}%</strong>
        </div>
        <LucideChevronDown :size="18" />
      </summary>

      <div class="advanced-panel-body">
        <div class="advanced-board">
          <div v-for="row in advancedChartRows" :key="row.plantel" class="advanced-board-row">
            <div class="advanced-board-head">
              <strong>{{ row.plantel }}</strong>
              <span>{{ formatNumber(row.evaluated) }}</span>
            </div>
            <div class="comparison-meter">
              <span>B</span>
              <div class="comparison-meter-track">
                <i class="is-basic" :style="{ width: `${row.basic}%` }"></i>
              </div>
              <strong>{{ row.basic }}%</strong>
            </div>
            <div class="comparison-meter">
              <span>A</span>
              <div class="comparison-meter-track">
                <i class="is-advanced" :style="{ width: `${row.advanced}%` }"></i>
              </div>
              <strong>{{ row.advanced }}%</strong>
            </div>
          </div>
        </div>
      </div>
    </details>

    <section v-if="orderedReports.length" class="plantel-section">
      <header class="section-heading">
        <h2>Detalle</h2>
        <span>{{ orderedReports.length }}</span>
      </header>

      <div class="plantel-board">
        <details v-for="report in orderedReports" :key="report.agentId" class="plantel-row-details">
          <summary class="plantel-row-summary">
            <div class="plantel-row-primary">
              <strong>{{ report.agentId }}</strong>
              <span>{{ formatNumber(scopeForReport(report).population.evaluated) }}</span>
            </div>

            <div class="plantel-row-meter">
              <div class="mini-bar-track">
                <div class="mini-bar-grid" aria-hidden="true">
                  <i v-for="tick in innerGridTicks" :key="`${report.agentId}-${tick}`" :style="{ left: `${tick}%` }"></i>
                </div>
                <i class="mini-bar-fill" :style="{ width: `${scopeForReport(report).basic.averagePercent}%` }"></i>
              </div>
            </div>

            <div class="plantel-row-stats">
              <div>
                <span>B</span>
                <strong>{{ scopeForReport(report).basic.averagePercent }}%</strong>
              </div>
              <div>
                <span>A</span>
                <strong>{{ scopeForReport(report).advanced.averagePercent }}%</strong>
              </div>
            </div>

            <LucideChevronDown class="summary-chevron" :size="18" />
          </summary>

          <div class="plantel-row-body">
            <div class="quality-strip" :aria-label="`Alertas de calidad de datos del plantel ${report.agentId}`">
              <div
                v-for="quality in visibleQualityBreakdown(scopeForReport(report))"
                :key="quality.key"
                class="quality-chip"
                :class="{ 'is-empty': quality.isEmpty }"
              >
                <span>{{ quality.label }}</span>
                <strong>{{ formatNumber(quality.count) }}</strong>
              </div>
            </div>

            <div class="detail-metric-grid">
              <article class="detail-metric-card">
                <span>Completos B</span>
                <strong>{{ formatNumber(scopeForReport(report).basic.completeRecords) }}</strong>
              </article>
              <article class="detail-metric-card">
                <span>Completos A</span>
                <strong>{{ formatNumber(scopeForReport(report).advanced.completeRecords) }}</strong>
              </article>
              <article class="detail-metric-card">
                <span>Incompletos</span>
                <strong>{{ formatNumber(scopeForReport(report).basic.incompleteRecords) }}</strong>
              </article>
              <article class="detail-metric-card">
                <span>Fuente</span>
                <strong class="detail-metric-copy">{{ sourceLabel(report.source) }}</strong>
              </article>
            </div>

            <div class="population-strip">
              <div v-for="item in populationBreakdown(scopeForReport(report))" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ formatNumber(item.count) }}</strong>
              </div>
            </div>

            <div class="field-columns">
              <section class="field-tier">
                <header>
                  <h4>Básico</h4>
                  <strong>{{ scopeForReport(report).basic.averagePercent }}%</strong>
                </header>
                <div class="field-list">
                  <div v-for="field in scopeForReport(report).basic.fields" :key="field.key" class="field-row">
                    <div>
                      <span>{{ field.label }}</span>
                      <small>{{ formatNumber(field.completed) }}/{{ formatNumber(field.total) }}</small>
                    </div>
                    <strong>{{ field.percent }}%</strong>
                    <div class="field-track"><i :style="{ width: `${field.percent}%` }"></i></div>
                  </div>
                </div>
              </section>

              <section class="field-tier is-advanced">
                <header>
                  <h4>Avanzado</h4>
                  <strong>{{ scopeForReport(report).advanced.averagePercent }}%</strong>
                </header>
                <div class="field-list">
                  <div v-for="field in scopeForReport(report).advanced.fields" :key="field.key" class="field-row">
                    <div>
                      <span>{{ field.label }}</span>
                      <small>{{ formatNumber(field.completed) }}/{{ formatNumber(field.total) }}</small>
                    </div>
                    <strong>{{ field.percent }}%</strong>
                    <div class="field-track"><i :style="{ width: `${field.percent}%` }"></i></div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LucideCheck,
  LucideChevronDown,
  LucideDownload,
  LucideLoader2,
  LucideRefreshCw,
  LucideSquare,
  LucideTriangleAlert,
} from 'lucide-vue-next'
import { CICLOS_LIST } from '~/utils/constants'
import { useActiveCiclo } from '~/composables/useActiveCiclo'
import { exportToCSV } from '~/utils/export'
import {
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope,
} from '~/shared/utils/studentPresentation'

const { activeCicloKey, setActiveCiclo } = useActiveCiclo()
const selectedCiclo = ref(activeCicloKey.value)
const scopeMode = ref('all')
const optionsLoading = ref(false)
const loading = ref(false)
const pageError = ref('')
const planteles = ref([])
const queueRows = ref([])
const reports = ref([])
const enrollmentConfig = ref(null)
const currentPlantel = ref('')
let currentController = null
let currentRunId = 0

const chartTicks = [0, 25, 50, 75, 100]
const innerGridTicks = [25, 50, 75]

const emptyTier = () => ({
  fieldCount: 0,
  completedFields: 0,
  possibleFields: 0,
  averagePercent: 0,
  completeRecords: 0,
  incompleteRecords: 0,
  completeRecordPercent: 0,
  fields: [],
})

const emptyScope = () => ({
  population: {
    totalVisible: 0,
    evaluated: 0,
    inscritos: 0,
    internos: 0,
    externos: 0,
    noInscritos: 0,
    bajas: 0,
    withoutOverlay: 0,
  },
  basic: emptyTier(),
  advanced: emptyTier(),
  quality: {},
  distribution: { byNivel: [], byGrupo: [] },
})

const scopeForReport = (report, mode = scopeMode.value) => {
  if (!report) return emptyScope()
  if (mode === 'externos') return report.scopes?.externos || emptyScope()
  return report.scopes?.all || {
    population: report.population || emptyScope().population,
    basic: report.basic || emptyTier(),
    advanced: report.advanced || emptyTier(),
    quality: report.quality || {},
    distribution: report.distribution || { byNivel: [], byGrupo: [] },
  }
}

const successfulReports = computed(() => planteles.value
  .map((item) => reports.value.find((report) => report.agentId === item.agentId))
  .filter(Boolean)
  .sort((a, b) => String(a.agentId).localeCompare(String(b.agentId), 'es', { numeric: true, sensitivity: 'base' })))

const orderedReports = computed(() => [...successfulReports.value].sort((a, b) => {
  const percentDifference = Number(scopeForReport(b).basic.averagePercent || 0) - Number(scopeForReport(a).basic.averagePercent || 0)
  if (percentDifference) return percentDifference
  return String(a.agentId).localeCompare(String(b.agentId), 'es', { numeric: true, sensitivity: 'base' })
}))

const processedCount = computed(() => queueRows.value.filter((item) => ['success', 'error', 'cancelled'].includes(item.status)).length)
const loadingPercent = computed(() => queueRows.value.length ? Math.round((processedCount.value / queueRows.value.length) * 100) : 0)
const loadSummaryLabel = computed(() => `${successfulReports.value.length} planteles`)

const aggregateTier = (key) => {
  let completedFields = 0
  let possibleFields = 0
  let completeRecords = 0
  let incompleteRecords = 0

  successfulReports.value.forEach((report) => {
    const tier = scopeForReport(report)[key] || emptyTier()
    completedFields += Number(tier.completedFields || 0)
    possibleFields += Number(tier.possibleFields || 0)
    completeRecords += Number(tier.completeRecords || 0)
    incompleteRecords += Number(tier.incompleteRecords || 0)
  })

  return {
    completedFields,
    possibleFields,
    averagePercent: possibleFields ? Math.round((completedFields / possibleFields) * 100) : 0,
    completeRecords,
    incompleteRecords,
  }
}

const globalBasic = computed(() => aggregateTier('basic'))
const globalAdvanced = computed(() => aggregateTier('advanced'))
const globalPopulation = computed(() => successfulReports.value.reduce((total, report) => {
  const population = scopeForReport(report).population
  Object.keys(total).forEach((key) => { total[key] += Number(population?.[key] || 0) })
  return total
}, emptyScope().population))

const basicChartRows = computed(() => orderedReports.value.map((report) => {
  const scope = scopeForReport(report)
  return {
    plantel: report.agentId,
    evaluated: scope.population.evaluated,
    basic: scope.basic.averagePercent,
    basicCompleteRecords: scope.basic.completeRecords,
  }
}))

const advancedChartRows = computed(() => orderedReports.value.map((report) => {
  const scope = scopeForReport(report)
  return {
    plantel: report.agentId,
    evaluated: scope.population.evaluated,
    basic: scope.basic.averagePercent,
    advanced: scope.advanced.averagePercent,
  }
}))

const basicChartAriaLabel = computed(() => {
  const scope = scopeMode.value === 'externos' ? 'alumnos externos' : 'todos los alumnos'
  return `Avance de expediente básico por plantel para ${scope}`
})

const formatNumber = (value) => new Intl.NumberFormat('es-MX').format(Number(value || 0))
const sourceLabel = (source = {}) => {
  if (source.bridgeFallback) return `respaldo verificado (${source.base || 'cache'})`
  if (source.cacheFreshness === 'live-bridge') return 'bridge en vivo'
  return source.base || source.cacheFreshness || 'Control Escolar'
}

const qualityBreakdown = (scope) => {
  const quality = scope?.quality || {}
  const basicFields = new Map((scope?.basic?.fields || []).map((field) => [field.key, Number(field.missing || 0)]))
  return [
    { key: 'incomplete', label: 'Expediente incompleto', count: quality.incomplete ?? scope?.basic?.incompleteRecords ?? 0 },
    { key: 'curp', label: 'Sin CURP', count: quality.sinCurp ?? basicFields.get('curp') ?? 0 },
    { key: 'grupo', label: 'Sin grupo', count: quality.sinGrupo ?? basicFields.get('grupo') ?? 0 },
    { key: 'padre', label: 'Sin datos de padre', count: quality.sinPadre ?? 0 },
    { key: 'madre', label: 'Sin datos de madre', count: quality.sinMadre ?? 0 },
    { key: 'contact', label: 'Sin contacto válido', count: quality.sinContacto ?? 0 },
  ]
}

const visibleQualityBreakdown = (scope) => {
  const items = qualityBreakdown(scope).filter((item) => Number(item.count || 0) > 0)
  if (items.length) return items
  return [{ key: 'clean', label: 'Sin alertas', count: 0, isEmpty: true }]
}

const populationBreakdown = (scope) => {
  const population = scope?.population || emptyScope().population
  if (scopeMode.value === 'externos') {
    return [
      { label: 'Externos', count: population.externos },
      { label: 'Completos B', count: scope?.basic?.completeRecords || 0 },
      { label: 'Completos A', count: scope?.advanced?.completeRecords || 0 },
      { label: 'Sin ficha', count: population.withoutOverlay },
    ]
  }
  return [
    { label: 'Internos', count: population.internos },
    { label: 'Externos', count: population.externos },
    { label: 'No inscritos', count: population.noInscritos },
    { label: 'Bajas', count: population.bajas },
    { label: 'Sin ficha', count: population.withoutOverlay },
  ]
}

const outsideBarPillStyle = (percent) => ({
  left: `min(calc(${Math.max(Number(percent || 0), 2)}% + 8px), calc(100% - 48px))`,
})

const replaceQueueItem = (plantel, patch) => {
  queueRows.value = queueRows.value.map((item) => item.plantel === plantel ? { ...item, ...patch } : item)
}
const replaceReport = (report) => {
  reports.value = [...reports.value.filter((item) => item.agentId !== report.agentId), report]
}
const sleep = (ms, signal) => new Promise((resolve) => {
  const timer = window.setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timer)
    resolve()
  }, { once: true })
})
const conceptsForPlantel = (plantel) => ({
  concepts: parseEnrollmentConceptsForScope(enrollmentConfig.value, {
    ciclo: selectedCiclo.value,
    plantel,
  }),
  tipoConcepts: parseEnrollmentConceptsForPlantelHistory(enrollmentConfig.value, { plantel }),
})

const runQueue = async (targets, { reset = false } = {}) => {
  if (!targets.length) return
  currentController?.abort()
  const runId = ++currentRunId
  currentController = new AbortController()
  const { signal } = currentController
  loading.value = true
  pageError.value = ''

  if (reset) {
    reports.value = []
    queueRows.value = planteles.value.map((item) => ({ plantel: item.agentId, status: 'pending', error: '' }))
  } else {
    targets.forEach((item) => replaceQueueItem(item.plantel, { status: 'pending', error: '' }))
  }

  try {
    for (let index = 0; index < targets.length; index += 1) {
      if (signal.aborted || runId !== currentRunId) break
      const target = targets[index]
      currentPlantel.value = target.plantel
      replaceQueueItem(target.plantel, { status: 'loading', error: '' })
      const conceptScope = conceptsForPlantel(target.plantel)

      try {
        const response = await $fetch('/api/control-escolar/progress-report', {
          cache: 'no-store',
          retry: 0,
          timeout: 90000,
          signal,
          query: {
            agentId: target.plantel,
            ciclo: selectedCiclo.value,
            concepts: conceptScope.concepts.join(',') || undefined,
            tipoConcepts: conceptScope.tipoConcepts.join(',') || undefined,
          },
        })
        if (response?.error) throw new Error(response.message || 'El plantel respondió con error.')
        if (signal.aborted || runId !== currentRunId) break
        replaceReport(response.report)
        replaceQueueItem(target.plantel, { status: 'success', error: '' })
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') break
        const message = error?.data?.message || error?.message || 'No se pudo consultar este plantel.'
        replaceQueueItem(target.plantel, { status: 'error', error: String(message).slice(0, 240) })
      }

      if (index < targets.length - 1 && !signal.aborted) await sleep(350, signal)
    }
  } finally {
    if (runId === currentRunId) {
      loading.value = false
      currentPlantel.value = ''
      currentController = null
    }
  }
}

const prepareReport = async () => {
  optionsLoading.value = true
  pageError.value = ''
  try {
    const options = await $fetch('/api/control-escolar/options', { cache: 'no-store', retry: 0 })
    planteles.value = Array.isArray(options?.planteles) ? options.planteles : []
    if (!planteles.value.length) throw new Error('No hay planteles autorizados para este usuario.')
    try {
      enrollmentConfig.value = await $fetch('/api/control-escolar/enrollment-config', { cache: 'no-store', retry: 0 })
    } catch (configError) {
      enrollmentConfig.value = null
      console.warn('[Reporte Control Escolar] Configuración de inscripción no disponible.', configError)
    }
    setActiveCiclo(selectedCiclo.value)
    await runQueue(planteles.value.map((item) => ({ plantel: item.agentId })), { reset: true })
  } catch (error) {
    pageError.value = error?.data?.message || error?.message || 'No se pudieron preparar los planteles del reporte.'
  } finally {
    optionsLoading.value = false
  }
}

watch(activeCicloKey, (value) => {
  if (selectedCiclo.value === value) return
  selectedCiclo.value = value
  prepareReport()
})

const refreshReport = () => prepareReport()
const cancelLoad = () => {
  currentController?.abort()
  queueRows.value = queueRows.value.map((item) => ['loading', 'pending'].includes(item.status) ? { ...item, status: 'cancelled' } : item)
  loading.value = false
  currentPlantel.value = ''
}
const downloadCsv = () => {
  const rows = successfulReports.value.map((report) => {
    const scope = scopeForReport(report)
    const quality = Object.fromEntries(qualityBreakdown(scope).map((item) => [item.key, item.count]))
    return {
      Plantel: report.agentId,
      Ciclo: selectedCiclo.value,
      Vista: scopeMode.value === 'externos' ? 'Externos' : 'Todos',
      Evaluados: scope.population.evaluated,
      Internos: scope.population.internos,
      Externos: scope.population.externos,
      'Expediente básico (%)': scope.basic.averagePercent,
      'Básicos completos': scope.basic.completeRecords,
      'Expediente avanzado (%)': scope.advanced.averagePercent,
      'Avanzados completos': scope.advanced.completeRecords,
      'Expediente incompleto': quality.incomplete,
      'Sin CURP': quality.curp,
      'Sin grupo': quality.grupo,
      'Sin datos de padre': quality.padre,
      'Sin datos de madre': quality.madre,
      'Sin contacto válido': quality.contact,
      'Sin ficha matrícula': scope.population.withoutOverlay,
      Fuente: sourceLabel(report.source),
    }
  })
  const scopeSuffix = scopeMode.value === 'externos' ? 'externos' : 'todos'
  exportToCSV(`avance-control-escolar-${scopeSuffix}-${selectedCiclo.value}.csv`, rows)
}

onMounted(prepareReport)
onBeforeUnmount(() => currentController?.abort())
</script>

<style scoped>
.progress-report-page {
  box-sizing: border-box;
  display: grid;
  gap: 1rem;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 1rem 1rem 2rem;
  color: #17233a;
}

.report-toolbar,
.load-monitor,
.chart-section,
.plantel-section,
.summary-card,
.advanced-panel {
  border: 1px solid rgba(210, 224, 214, .92);
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 10px 28px rgba(29, 58, 76, .05);
}

.report-toolbar {
  display: flex;
  gap: 1rem;
  align-items: end;
  justify-content: space-between;
  border-radius: 22px;
  padding: 1rem;
}

.report-title > span,
.cycle-control > span,
.summary-card > span,
.detail-metric-card > span,
.advanced-panel-title > span {
  color: #28723a;
  font-size: .67rem;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.report-title h1 {
  margin: .15rem 0 0;
  color: #142039;
  font-size: clamp(1.55rem, 2.4vw, 2.15rem);
  font-weight: 920;
  letter-spacing: -.04em;
}

.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  align-items: end;
  justify-content: flex-end;
}

.cycle-control {
  display: grid;
  gap: .25rem;
}

.report-actions select,
.report-actions > button,
.scope-toggle button {
  min-height: 40px;
  border: 1px solid #cfdcd1;
  border-radius: 12px;
  background: #fff;
  color: #24344c;
  font-weight: 820;
}

.report-actions select { padding: 0 .75rem; }
.report-actions > button,
.scope-toggle button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  padding: 0 .78rem;
  cursor: pointer;
}
.report-actions > button.primary {
  border-color: #27733a;
  background: #27733a;
  color: #fff;
}
.report-actions > button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.scope-toggle {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(76px, 1fr));
  gap: 3px;
  border: 1px solid #cfdcd1;
  border-radius: 13px;
  background: #edf2ee;
  padding: 3px;
}
.scope-toggle button {
  min-height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  padding: 0 .8rem;
}
.scope-toggle button.active {
  background: #27733a;
  color: #fff;
}

.load-monitor {
  border-radius: 18px;
  padding: .72rem .85rem;
}
.load-monitor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: .75rem;
  align-items: center;
  font-size: .78rem;
}
.load-state {
  display: flex;
  gap: .5rem;
  align-items: center;
  min-width: 0;
  color: #286f3a;
}
.load-state strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.load-monitor-row > span { color: #738078; font-weight: 800; }
.load-monitor-row > strong { color: #216f37; font-size: 1rem; }

.overall-track,
.field-track {
  overflow: hidden;
  border-radius: 999px;
  background: #e8efe9;
}
.overall-track { height: 8px; margin-top: .65rem; }
.overall-track i,
.field-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2b7c3e, #62a952);
  transition: width .28s ease;
}

.report-error {
  display: flex;
  gap: .65rem;
  align-items: center;
  border: 1px solid #efc6bd;
  border-radius: 16px;
  background: #fff5f2;
  padding: .8rem .9rem;
  color: #a33d32;
  font-size: .82rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .75rem;
}
.summary-card {
  display: grid;
  gap: .3rem;
  min-height: 90px;
  align-content: center;
  border-radius: 18px;
  padding: .95rem;
}
.summary-card > strong {
  font-size: 1.8rem;
  font-weight: 950;
  letter-spacing: -.04em;
  line-height: 1;
}
.summary-card.is-basic {
  border-color: rgba(94, 154, 104, .24);
  background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
}
.summary-card.is-advanced {
  border-color: rgba(95, 144, 176, .24);
  background: linear-gradient(180deg, #ffffff 0%, #f7fbfc 100%);
}

.chart-section,
.plantel-section,
.advanced-panel {
  border-radius: 22px;
  padding: 1rem;
}
.section-heading {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding-bottom: .9rem;
}
.section-heading h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 930;
  letter-spacing: -.03em;
}
.section-heading > span {
  border-radius: 999px;
  background: #edf7ee;
  padding: .35rem .65rem;
  color: #28723a;
  font-size: .72rem;
  font-weight: 900;
}

.empty-state {
  border-radius: 16px;
  background: #fbfdfb;
  padding: 1rem;
  color: #718075;
  font-size: .82rem;
  text-align: center;
}

.calm-chart {
  display: grid;
  gap: .7rem;
}
.calm-chart-axis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-left: 148px;
  color: #7b877f;
  font-size: .62rem;
  font-weight: 800;
}
.calm-chart-axis span { text-align: center; }
.calm-chart-axis span:first-child { text-align: left; }
.calm-chart-axis span:last-child { text-align: right; }
.calm-chart-row {
  display: grid;
  gap: .45rem;
}
.calm-row-head {
  display: grid;
  grid-template-columns: 140px auto;
  gap: .8rem;
  align-items: end;
}
.calm-row-label {
  display: flex;
  gap: .45rem;
  align-items: baseline;
  min-width: 0;
}
.calm-row-label strong,
.advanced-board-head strong,
.plantel-row-primary strong {
  color: #1d2b43;
  font-size: .85rem;
  font-weight: 930;
}
.calm-row-label span,
.advanced-board-head span,
.plantel-row-primary span {
  color: #7b867e;
  font-size: .68rem;
  font-weight: 780;
}
.calm-row-head small {
  color: #7b867e;
  font-size: .68rem;
  font-weight: 780;
  text-align: right;
}
.calm-bar-track,
.mini-bar-track {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: #eef2ef;
}
.calm-bar-track {
  height: 30px;
}
.mini-bar-track {
  height: 14px;
}
.calm-bar-grid,
.mini-bar-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.calm-bar-grid i,
.mini-bar-grid i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(127, 142, 132, .22);
}
.calm-bar-fill,
.mini-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5a95e5, #4e88d6);
  transition: width .25s ease;
}
.calm-bar-fill {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.calm-bar-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 24px;
  margin-right: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .92);
  color: #1b3a5d;
  font-size: .73rem;
  font-weight: 950;
}
.calm-bar-pill.is-outside {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  margin-right: 0;
}

.advanced-panel {
  padding: 0;
  overflow: hidden;
}
.advanced-panel summary,
.plantel-row-summary {
  display: flex;
  gap: .9rem;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
}
.advanced-panel summary {
  padding: .95rem 1rem;
}
.advanced-panel summary::-webkit-details-marker,
.plantel-row-summary::-webkit-details-marker { display: none; }
.advanced-panel[open] summary svg,
.plantel-row-details[open] .summary-chevron { transform: rotate(180deg); }
.advanced-panel-title {
  display: flex;
  gap: .55rem;
  align-items: baseline;
}
.advanced-panel-title strong {
  font-size: 1.02rem;
  font-weight: 930;
}
.advanced-panel-body {
  border-top: 1px solid #edf1ee;
  padding: 0 1rem 1rem;
  background: #fcfdfc;
}
.advanced-board {
  display: grid;
}
.advanced-board-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) minmax(0, 1fr);
  gap: .8rem;
  align-items: center;
  padding: .8rem 0;
  border-bottom: 1px solid #edf1ee;
}
.advanced-board-row:last-child { border-bottom: 0; }
.advanced-board-head {
  display: grid;
  gap: .15rem;
}
.comparison-meter {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 42px;
  gap: .55rem;
  align-items: center;
}
.comparison-meter > span {
  color: #66736b;
  font-size: .7rem;
  font-weight: 900;
}
.comparison-meter > strong {
  text-align: right;
  font-size: .76rem;
  font-weight: 920;
}
.comparison-meter-track {
  overflow: hidden;
  height: 10px;
  border-radius: 999px;
  background: #edf1ee;
}
.comparison-meter-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width .25s ease;
}
.comparison-meter-track i.is-basic { background: linear-gradient(90deg, #5a95e5, #4e88d6); }
.comparison-meter-track i.is-advanced { background: linear-gradient(90deg, #5ea0b6, #4f8b9e); }

.plantel-board {
  overflow: hidden;
  border: 1px solid #e4ebe6;
  border-radius: 18px;
  background: #fff;
}
.plantel-row-details {
  border-bottom: 1px solid #edf1ee;
}
.plantel-row-details:last-child { border-bottom: 0; }
.plantel-row-summary {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 110px auto;
  gap: .9rem;
  padding: .9rem 1rem;
}
.plantel-row-primary {
  display: grid;
  gap: .15rem;
}
.plantel-row-meter {
  align-self: center;
}
.plantel-row-stats {
  display: flex;
  gap: .75rem;
  align-items: center;
  justify-content: flex-end;
}
.plantel-row-stats > div {
  display: grid;
  gap: .12rem;
  text-align: right;
}
.plantel-row-stats span {
  color: #7a867e;
  font-size: .63rem;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.plantel-row-stats strong {
  font-size: .82rem;
  font-weight: 930;
}
.summary-chevron {
  color: #617168;
}
.plantel-row-body {
  display: grid;
  gap: .9rem;
  border-top: 1px solid #edf1ee;
  padding: 1rem;
  background: #fbfdfb;
}

.quality-strip {
  display: flex;
  flex-wrap: wrap;
  gap: .45rem;
}
.quality-chip {
  display: inline-flex;
  flex: 0 0 auto;
  gap: .45rem;
  align-items: center;
  min-height: 32px;
  border: 1px solid #dbe5e8;
  border-radius: 999px;
  background: #fff;
  padding: .3rem .45rem .3rem .7rem;
  color: #3b4960;
  font-size: .71rem;
  font-weight: 820;
  white-space: nowrap;
}
.quality-chip strong {
  display: grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  background: #edf3ef;
  color: #4d5e71;
  font-size: .68rem;
  font-weight: 950;
}
.quality-chip.is-empty {
  border-color: #dfeae2;
  background: #f8fcf9;
  color: #4b6b54;
}
.quality-chip.is-empty strong {
  background: #e4f5e6;
  color: #25803a;
}

.detail-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .65rem;
}
.detail-metric-card {
  display: grid;
  gap: .24rem;
  border: 1px solid #e3eae5;
  border-radius: 14px;
  background: #fff;
  padding: .75rem;
}
.detail-metric-card > strong {
  font-size: 1rem;
  font-weight: 920;
}
.detail-metric-copy {
  font-size: .76rem;
  font-weight: 820;
}
.population-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: .55rem;
}
.population-strip > div {
  display: grid;
  gap: .18rem;
  border: 1px solid #e3eae5;
  border-radius: 13px;
  background: #fff;
  padding: .6rem .7rem;
}
.population-strip span { color: #6b786f; font-size: .66rem; font-weight: 800; }
.population-strip strong { font-size: .98rem; }

.field-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .9rem;
}
.field-tier {
  border: 1px solid #e2e9e3;
  border-radius: 18px;
  background: #fff;
  padding: .85rem;
}
.field-tier > header {
  display: flex;
  gap: .75rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: .7rem;
}
.field-tier h4 { margin: 0; font-size: .82rem; font-weight: 900; }
.field-tier > header strong { color: #247139; font-size: .9rem; }
.field-tier.is-advanced > header strong { color: #3f7386; }
.field-list { display: grid; gap: .48rem; }
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: .28rem .6rem;
}
.field-row span { display: block; font-size: .7rem; font-weight: 760; }
.field-row small { color: #7a867e; font-size: .63rem; }
.field-row > strong { font-size: .7rem; }
.field-track { grid-column: 1 / -1; height: 7px; }
.field-tier.is-advanced .field-track i { background: linear-gradient(90deg, #3f7386, #6ca1b2); }

.spinning { animation: reportSpin .9s linear infinite; }
@keyframes reportSpin { to { transform: rotate(360deg); } }

@media (max-width: 1080px) {
  .detail-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .population-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .advanced-board-row,
  .plantel-row-summary {
    grid-template-columns: 1fr;
  }
  .plantel-row-stats {
    justify-content: flex-start;
  }
  .calm-chart-axis {
    margin-left: 0;
  }
}

@media (max-width: 720px) {
  .progress-report-page { padding: .75rem; }
  .report-toolbar { align-items: start; flex-direction: column; }
  .report-actions { width: 100%; justify-content: flex-start; }
  .scope-toggle { order: -1; width: 100%; }
  .cycle-control { flex: 1 1 160px; }
  .cycle-control select { width: 100%; }
  .field-columns,
  .detail-metric-grid {
    grid-template-columns: 1fr;
  }
  .population-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .calm-chart-axis { display: none; }
  .calm-row-head {
    grid-template-columns: 1fr;
    gap: .35rem;
  }
  .calm-row-head small {
    text-align: left;
  }
}

@media (max-width: 480px) {
  .summary-grid,
  .population-strip {
    grid-template-columns: 1fr 1fr;
  }
  .summary-card { min-height: 82px; }
  .summary-card > strong { font-size: 1.5rem; }
  .load-monitor-row { grid-template-columns: minmax(0, 1fr) auto; }
  .load-monitor-row > span { display: none; }
  .comparison-meter {
    grid-template-columns: 18px minmax(0, 1fr) 38px;
    gap: .45rem;
  }
}
</style>
