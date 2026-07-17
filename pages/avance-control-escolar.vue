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
        <span>Expediente básico</span>
        <strong>{{ globalBasic.averagePercent }}%</strong>
      </article>
      <article class="summary-card is-advanced">
        <span>Expediente avanzado</span>
        <strong>{{ globalAdvanced.averagePercent }}%</strong>
      </article>
    </section>

    <section class="chart-section">
      <header class="section-heading">
        <h2>Comparativo por plantel</h2>
        <div class="chart-legend" aria-label="Series">
          <span><i class="is-basic"></i>Básico</span>
          <span><i class="is-advanced"></i>Avanzado</span>
        </div>
      </header>

      <div v-if="chartRows.length" class="comparison-chart" role="img" :aria-label="chartAriaLabel">
        <div class="chart-axis" aria-hidden="true">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>

        <article v-for="row in chartRows" :key="row.plantel" class="chart-row">
          <div class="chart-plantel">
            <strong>{{ row.plantel }}</strong>
            <span>{{ formatNumber(row.evaluated) }}</span>
          </div>

          <div class="chart-series">
            <div class="chart-bar-line">
              <span>Básico</span>
              <div class="chart-track">
                <i class="is-basic" :style="{ width: `${row.basic}%` }"></i>
              </div>
              <strong>{{ row.basic }}%</strong>
            </div>
            <div class="chart-bar-line">
              <span>Avanzado</span>
              <div class="chart-track">
                <i class="is-advanced" :style="{ width: `${row.advanced}%` }"></i>
              </div>
              <strong>{{ row.advanced }}%</strong>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="successfulReports.length" class="plantel-section">
      <header class="section-heading">
        <h2>Desglose por plantel</h2>
        <span>{{ scopeMode === 'externos' ? 'Externos' : 'Todos' }}</span>
      </header>

      <div class="plantel-list">
        <article v-for="report in successfulReports" :key="report.agentId" class="plantel-card">
          <header class="plantel-card-header">
            <div class="plantel-identity">
              <span>Plantel</span>
              <h3>{{ report.agentId }}</h3>
            </div>
            <div class="plantel-head-metrics">
              <div>
                <span>Evaluados</span>
                <strong>{{ formatNumber(scopeForReport(report).population.evaluated) }}</strong>
              </div>
              <div>
                <span>Básico</span>
                <strong>{{ scopeForReport(report).basic.averagePercent }}%</strong>
              </div>
              <div>
                <span>Avanzado</span>
                <strong>{{ scopeForReport(report).advanced.averagePercent }}%</strong>
              </div>
            </div>
          </header>

          <div class="quality-strip" :aria-label="`Calidad de datos del plantel ${report.agentId}`">
            <div v-for="quality in qualityBreakdown(scopeForReport(report))" :key="quality.key" class="quality-chip">
              <span>{{ quality.label }}</span>
              <strong>{{ formatNumber(quality.count) }}</strong>
            </div>
          </div>

          <details class="plantel-breakdown">
            <summary>
              <span>Campos</span>
              <LucideChevronDown :size="18" />
            </summary>

            <div class="breakdown-body">
              <div class="population-strip">
                <div v-for="item in populationBreakdown(scopeForReport(report))" :key="item.label">
                  <span>{{ item.label }}</span>
                  <strong>{{ formatNumber(item.count) }}</strong>
                </div>
              </div>

              <div class="field-columns">
                <section class="field-tier">
                  <header>
                    <h4>Expediente básico</h4>
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
                    <h4>Expediente avanzado</h4>
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
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  LucideCheck,
  LucideChevronDown,
  LucideDownload,
  LucideLoader2,
  LucideRefreshCw,
  LucideSquare,
  LucideTriangleAlert,
} from 'lucide-vue-next'
import { CICLOS_LIST, normalizeCicloOption } from '~/utils/constants'
import { exportToCSV } from '~/utils/export'
import {
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope,
} from '~/shared/utils/studentPresentation'

const activeCicloCookie = useCookie('active_ciclo')
const selectedCiclo = ref(normalizeCicloOption(activeCicloCookie.value || ''))
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

const chartRows = computed(() => successfulReports.value.map((report) => {
  const scope = scopeForReport(report)
  return {
    plantel: report.agentId,
    evaluated: scope.population.evaluated,
    basic: scope.basic.averagePercent,
    advanced: scope.advanced.averagePercent,
  }
}))

const chartAriaLabel = computed(() => {
  const scope = scopeMode.value === 'externos' ? 'alumnos externos' : 'todos los alumnos'
  return `Avance de expediente básico y avanzado por plantel para ${scope}`
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

const populationBreakdown = (scope) => {
  const population = scope?.population || emptyScope().population
  if (scopeMode.value === 'externos') {
    return [
      { label: 'Externos', count: population.externos },
      { label: 'Básicos completos', count: scope?.basic?.completeRecords || 0 },
      { label: 'Avanzados completos', count: scope?.advanced?.completeRecords || 0 },
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
    activeCicloCookie.value = selectedCiclo.value
    await runQueue(planteles.value.map((item) => ({ plantel: item.agentId })), { reset: true })
  } catch (error) {
    pageError.value = error?.data?.message || error?.message || 'No se pudieron preparar los planteles del reporte.'
  } finally {
    optionsLoading.value = false
  }
}

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
  gap: .85rem;
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
.summary-card {
  border: 1px solid rgba(210, 224, 214, .92);
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 10px 28px rgba(29, 58, 76, .055);
}

.report-toolbar {
  display: flex;
  gap: 1rem;
  align-items: end;
  justify-content: space-between;
  border-radius: 20px;
  padding: 1rem;
}

.report-title > span,
.cycle-control > span,
.summary-card > span,
.plantel-identity > span:first-child,
.plantel-head-metrics span {
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
  border-radius: 16px;
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
  background: #e6eee8;
}
.overall-track { height: 7px; margin-top: .6rem; }
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
  border-radius: 15px;
  background: #fff5f2;
  padding: .8rem .9rem;
  color: #a33d32;
  font-size: .82rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .7rem;
}
.summary-card {
  display: grid;
  gap: .25rem;
  min-height: 86px;
  align-content: center;
  border-radius: 17px;
  padding: .85rem;
}
.summary-card > strong {
  font-size: 1.75rem;
  font-weight: 950;
  letter-spacing: -.04em;
  line-height: 1;
}
.summary-card.is-basic { border-bottom: 3px solid #4f9d56; }
.summary-card.is-advanced { border-bottom: 3px solid #4d7f9d; }

.chart-section,
.plantel-section {
  border-radius: 20px;
  padding: .85rem;
}
.section-heading {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: .15rem .15rem .75rem;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 920;
  letter-spacing: -.025em;
}
.section-heading > span {
  border-radius: 999px;
  background: #edf7ee;
  padding: .35rem .6rem;
  color: #28723a;
  font-size: .7rem;
  font-weight: 900;
}
.chart-legend {
  display: flex;
  gap: .8rem;
  color: #526158;
  font-size: .7rem;
  font-weight: 850;
}
.chart-legend span {
  display: inline-flex;
  gap: .35rem;
  align-items: center;
}
.chart-legend i {
  width: 18px;
  height: 8px;
  border-radius: 999px;
}
.chart-legend i.is-basic,
.chart-track i.is-basic { background: #388447; }
.chart-legend i.is-advanced,
.chart-track i.is-advanced { background: #416f91; }

.comparison-chart {
  display: grid;
  gap: .35rem;
  border-top: 1px solid #e8eee9;
  padding-top: .7rem;
}
.chart-axis {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-left: 168px;
  padding: 0 48px 0 68px;
  color: #7b877f;
  font-size: .62rem;
  font-weight: 750;
}
.chart-axis span { text-align: center; }
.chart-axis span:first-child { text-align: left; }
.chart-axis span:last-child { text-align: right; }
.chart-row {
  display: grid;
  grid-template-columns: 155px minmax(0, 1fr);
  gap: .8rem;
  align-items: center;
  border-radius: 12px;
  padding: .5rem .6rem;
}
.chart-row:nth-child(even) { background: #fafcfb; }
.chart-plantel {
  display: grid;
  min-width: 0;
}
.chart-plantel strong {
  overflow: hidden;
  color: #1c2b43;
  font-size: .78rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chart-plantel span {
  color: #7a867e;
  font-size: .64rem;
  font-weight: 750;
}
.chart-series { display: grid; gap: .32rem; }
.chart-bar-line {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) 42px;
  gap: .5rem;
  align-items: center;
}
.chart-bar-line > span {
  color: #66736b;
  font-size: .64rem;
  font-weight: 800;
}
.chart-bar-line > strong {
  text-align: right;
  font-size: .7rem;
  font-weight: 900;
}
.chart-track {
  overflow: hidden;
  height: 10px;
  border-radius: 999px;
  background-color: #edf1ee;
  background-image: linear-gradient(to right, transparent calc(25% - 1px), rgba(135, 151, 141, .2) 25%, transparent calc(25% + 1px));
  background-size: 25% 100%;
}
.chart-track i {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: inherit;
  transition: width .25s ease;
}

.plantel-list { display: grid; gap: .72rem; }
.plantel-card {
  overflow: hidden;
  border: 1px solid #dfe8e1;
  border-radius: 17px;
  background: #fff;
}
.plantel-card-header {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: .8rem .9rem;
  background: #fbfdfb;
}
.plantel-identity {
  display: flex;
  gap: .55rem;
  align-items: center;
  min-width: 0;
}
.plantel-identity h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 950;
  letter-spacing: -.035em;
}
.plantel-head-metrics {
  display: flex;
  gap: .8rem;
}
.plantel-head-metrics > div {
  display: grid;
  min-width: 72px;
  text-align: right;
}
.plantel-head-metrics strong { font-size: 1rem; }

.quality-strip {
  display: flex;
  gap: .45rem;
  overflow-x: auto;
  padding: .75rem .9rem .85rem;
  scrollbar-width: thin;
}
.quality-chip {
  display: inline-flex;
  flex: 0 0 auto;
  gap: .45rem;
  align-items: center;
  min-height: 34px;
  border: 1px solid #dbe5e8;
  border-radius: 10px;
  background: #fff;
  padding: .32rem .45rem .32rem .72rem;
  color: #3b4960;
  font-size: .72rem;
  font-weight: 820;
  white-space: nowrap;
}
.quality-chip strong {
  display: grid;
  min-width: 23px;
  height: 23px;
  place-items: center;
  border-radius: 999px;
  background: #e4f5e6;
  color: #25803a;
  font-size: .7rem;
  font-weight: 950;
}

.plantel-breakdown { border-top: 1px solid #e4ebe5; }
.plantel-breakdown summary {
  display: flex;
  gap: .55rem;
  align-items: center;
  justify-content: flex-end;
  padding: .65rem .9rem;
  color: #526158;
  cursor: pointer;
  font-size: .73rem;
  font-weight: 850;
  list-style: none;
}
.plantel-breakdown summary::-webkit-details-marker { display: none; }
.plantel-breakdown[open] summary svg { transform: rotate(180deg); }
.breakdown-body {
  display: grid;
  gap: .85rem;
  border-top: 1px solid #edf1ee;
  padding: .85rem .9rem 1rem;
  background: #fcfdfc;
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
  border-radius: 11px;
  background: #fff;
  padding: .55rem .65rem;
}
.population-strip span { color: #6b786f; font-size: .66rem; font-weight: 800; }
.population-strip strong { font-size: .95rem; }

.field-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .9rem;
}
.field-tier {
  border: 1px solid #e2e9e3;
  border-radius: 14px;
  background: #fff;
  padding: .75rem;
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
.field-tier.is-advanced > header strong { color: #315f82; }
.field-list { display: grid; gap: .48rem; }
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: .28rem .6rem;
}
.field-row span { display: block; font-size: .7rem; font-weight: 760; }
.field-row small { color: #7a867e; font-size: .63rem; }
.field-row > strong { font-size: .7rem; }
.field-track { grid-column: 1 / -1; height: 6px; }
.field-tier.is-advanced .field-track i { background: linear-gradient(90deg, #315f82, #5b8fb1); }

.spinning { animation: reportSpin .9s linear infinite; }
@keyframes reportSpin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .population-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .progress-report-page { padding: .7rem; }
  .report-toolbar { align-items: start; flex-direction: column; }
  .report-actions { width: 100%; justify-content: flex-start; }
  .scope-toggle { order: -1; width: 100%; }
  .cycle-control { flex: 1 1 160px; }
  .cycle-control select { width: 100%; }
  .chart-axis { display: none; }
  .chart-row {
    grid-template-columns: 1fr;
    gap: .35rem;
    padding: .65rem;
  }
  .chart-plantel { grid-template-columns: minmax(0, 1fr) auto; gap: .6rem; }
  .chart-plantel span { align-self: center; }
  .plantel-card-header { align-items: start; }
  .field-columns { grid-template-columns: 1fr; }
  .population-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
  .summary-grid { grid-template-columns: 1fr 1fr; }
  .summary-card { min-height: 78px; }
  .summary-card > strong { font-size: 1.5rem; }
  .plantel-card-header { display: grid; }
  .plantel-head-metrics { justify-content: flex-start; flex-wrap: wrap; }
  .plantel-head-metrics > div { text-align: left; }
  .plantel-identity { flex-wrap: wrap; }
  .load-monitor-row { grid-template-columns: minmax(0, 1fr) auto; }
  .load-monitor-row > span { display: none; }
  .chart-bar-line { grid-template-columns: 52px minmax(0, 1fr) 38px; gap: .35rem; }
}
</style>
