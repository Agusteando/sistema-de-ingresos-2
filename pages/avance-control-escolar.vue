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
      <article class="summary-card">
        <span>Básicos completos</span>
        <strong>{{ formatNumber(globalBasic.completeRecords) }}</strong>
      </article>
    </section>

    <section class="chart-section">
      <header class="section-heading">
        <div class="section-heading-copy">
          <h2>Avance de expediente básico por plantel</h2>
          <p>
            Porcentaje de avance en {{ selectedCiclo }}, ordenado de mayor a menor.
            La información avanzada se muestra solo bajo demanda.
          </p>
        </div>
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
              <span>{{ formatNumber(row.evaluated) }} evaluados</span>
            </div>
            <small>{{ formatNumber(row.basicCompleteRecords) }} completos</small>
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
        No hay datos disponibles para construir la gráfica.
      </div>
    </section>

    <details v-if="successfulReports.length" class="advanced-insights">
      <summary>
        <div class="advanced-summary-copy">
          <span>Información avanzada</span>
          <strong>{{ globalAdvanced.averagePercent }}% promedio</strong>
          <small>Abre esta sección para ver el comparativo y métricas avanzadas.</small>
        </div>
        <LucideChevronDown :size="18" />
      </summary>

      <div class="advanced-insights-body">
        <section class="advanced-summary-grid">
          <article class="advanced-summary-card">
            <span>Promedio avanzado</span>
            <strong>{{ globalAdvanced.averagePercent }}%</strong>
          </article>
          <article class="advanced-summary-card">
            <span>Avanzados completos</span>
            <strong>{{ formatNumber(globalAdvanced.completeRecords) }}</strong>
          </article>
          <article class="advanced-summary-card">
            <span>Incompletos avanzados</span>
            <strong>{{ formatNumber(globalAdvanced.incompleteRecords) }}</strong>
          </article>
        </section>

        <div class="comparison-compact-list">
          <article v-for="row in advancedChartRows" :key="row.plantel" class="comparison-compact-card">
            <div class="comparison-compact-head">
              <div>
                <strong>{{ row.plantel }}</strong>
                <span>{{ formatNumber(row.evaluated) }} evaluados</span>
              </div>
            </div>

            <div class="comparison-meter">
              <span>Básico</span>
              <div class="comparison-meter-track">
                <i class="is-basic" :style="{ width: `${row.basic}%` }"></i>
              </div>
              <strong>{{ row.basic }}%</strong>
            </div>

            <div class="comparison-meter">
              <span>Avanzado</span>
              <div class="comparison-meter-track">
                <i class="is-advanced" :style="{ width: `${row.advanced}%` }"></i>
              </div>
              <strong>{{ row.advanced }}%</strong>
            </div>
          </article>
        </div>
      </div>
    </details>

    <section v-if="orderedReports.length" class="plantel-section">
      <header class="section-heading">
        <div class="section-heading-copy">
          <h2>Planteles</h2>
          <p>
            Vista reducida para revisar rápido el avance básico. El detalle completo y las métricas avanzadas
            aparecen al interactuar con cada tarjeta.
          </p>
        </div>
        <span>{{ orderedReports.length }} resultados</span>
      </header>

      <div class="plantel-list">
        <article v-for="report in orderedReports" :key="report.agentId" class="plantel-card">
          <div class="plantel-card-shell">
            <div class="plantel-card-top">
              <div class="plantel-identity">
                <span>Plantel</span>
                <h3>{{ report.agentId }}</h3>
                <small>{{ formatNumber(scopeForReport(report).population.evaluated) }} evaluados</small>
              </div>

              <div class="plantel-score">
                <span>Expediente básico</span>
                <strong>{{ scopeForReport(report).basic.averagePercent }}%</strong>
              </div>
            </div>

            <div class="plantel-meter">
              <div class="calm-bar-track">
                <div class="calm-bar-grid" aria-hidden="true">
                  <i v-for="tick in innerGridTicks" :key="`${report.agentId}-${tick}`" :style="{ left: `${tick}%` }"></i>
                </div>
                <div class="calm-bar-fill" :style="{ width: `${scopeForReport(report).basic.averagePercent}%` }">
                  <span
                    v-if="scopeForReport(report).basic.averagePercent >= 18"
                    class="calm-bar-pill"
                  >
                    {{ scopeForReport(report).basic.averagePercent }}%
                  </span>
                </div>
                <span
                  v-if="scopeForReport(report).basic.averagePercent < 18"
                  class="calm-bar-pill is-outside"
                  :style="outsideBarPillStyle(scopeForReport(report).basic.averagePercent)"
                >
                  {{ scopeForReport(report).basic.averagePercent }}%
                </span>
              </div>
            </div>

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
          </div>

          <details class="plantel-breakdown">
            <summary>
              <span>Ver detalle y métricas avanzadas</span>
              <LucideChevronDown :size="18" />
            </summary>

            <div class="breakdown-body">
              <div class="detail-metric-grid">
                <article class="detail-metric-card">
                  <span>Básicos completos</span>
                  <strong>{{ formatNumber(scopeForReport(report).basic.completeRecords) }}</strong>
                </article>
                <article class="detail-metric-card">
                  <span>Avanzado promedio</span>
                  <strong>{{ scopeForReport(report).advanced.averagePercent }}%</strong>
                </article>
                <article class="detail-metric-card">
                  <span>Avanzados completos</span>
                  <strong>{{ formatNumber(scopeForReport(report).advanced.completeRecords) }}</strong>
                </article>
                <article class="detail-metric-card is-wide">
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
  return [{ key: 'clean', label: 'Sin alertas visibles', count: 0, isEmpty: true }]
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
.advanced-insights {
  border: 1px solid rgba(210, 224, 214, .92);
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 14px 34px rgba(29, 58, 76, .055);
}

.report-toolbar {
  display: flex;
  gap: 1rem;
  align-items: end;
  justify-content: space-between;
  border-radius: 24px;
  padding: 1rem;
}

.report-title > span,
.cycle-control > span,
.summary-card > span,
.plantel-identity > span:first-child,
.plantel-score > span,
.advanced-summary-copy > span,
.detail-metric-card > span,
.advanced-summary-card > span {
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
  border-radius: 20px;
  padding: .78rem .9rem;
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
  gap: .8rem;
}
.summary-card {
  display: grid;
  gap: .35rem;
  min-height: 96px;
  align-content: center;
  border-radius: 20px;
  padding: 1rem;
}
.summary-card > strong {
  font-size: 1.9rem;
  font-weight: 950;
  letter-spacing: -.04em;
  line-height: 1;
}
.summary-card.is-basic {
  border-color: rgba(94, 154, 104, .25);
  background: linear-gradient(180deg, #ffffff 0%, #f6fbf7 100%);
}

.chart-section,
.plantel-section,
.advanced-insights {
  border-radius: 24px;
  padding: 1rem;
}
.section-heading {
  display: flex;
  gap: 1rem;
  align-items: start;
  justify-content: space-between;
  padding: .1rem .1rem .9rem;
}
.section-heading-copy {
  display: grid;
  gap: .32rem;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 920;
  letter-spacing: -.025em;
}
.section-heading p,
.advanced-summary-copy small,
.comparison-compact-head span,
.calm-row-label span,
.calm-row-head small,
.plantel-identity small,
.detail-metric-copy {
  margin: 0;
  color: #6f7c73;
  font-size: .72rem;
  line-height: 1.45;
}
.section-heading > span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: #edf7ee;
  padding: .38rem .65rem;
  color: #28723a;
  font-size: .72rem;
  font-weight: 900;
}

.empty-state {
  border: 1px dashed #d8e2da;
  border-radius: 18px;
  padding: 1rem;
  color: #6f7c73;
  font-size: .85rem;
  text-align: center;
}

.calm-chart {
  display: grid;
  gap: .8rem;
}
.calm-chart-axis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-left: 168px;
  padding-right: .3rem;
  color: #7b877f;
  font-size: .64rem;
  font-weight: 800;
}
.calm-chart-axis span {
  text-align: center;
}
.calm-chart-axis span:first-child { text-align: left; }
.calm-chart-axis span:last-child { text-align: right; }
.calm-chart-row {
  display: grid;
  gap: .5rem;
  padding: .85rem .9rem;
  border: 1px solid #edf2ee;
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdfc 100%);
}
.calm-row-head {
  display: flex;
  gap: .75rem;
  align-items: center;
  justify-content: space-between;
}
.calm-row-label {
  display: grid;
  gap: .18rem;
}
.calm-row-label strong,
.comparison-compact-head strong {
  color: #1c2b43;
  font-size: .9rem;
  font-weight: 900;
}
.calm-row-head small {
  font-weight: 800;
  white-space: nowrap;
}
.calm-bar-track {
  position: relative;
  overflow: hidden;
  height: 30px;
  border-radius: 999px;
  background: #eef2ef;
}
.calm-bar-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.calm-bar-grid i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(127, 142, 132, .23);
}
.calm-bar-fill {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5a95e5, #4e88d6);
  transition: width .25s ease;
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

.advanced-insights {
  padding: 0;
  overflow: hidden;
}
.advanced-insights summary {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  cursor: pointer;
  list-style: none;
}
.advanced-insights summary::-webkit-details-marker { display: none; }
.advanced-insights[open] summary svg,
.plantel-breakdown[open] summary svg { transform: rotate(180deg); }
.advanced-summary-copy {
  display: grid;
  gap: .18rem;
}
.advanced-summary-copy strong {
  font-size: 1rem;
  font-weight: 920;
  letter-spacing: -.02em;
}
.advanced-insights-body {
  display: grid;
  gap: 1rem;
  border-top: 1px solid #edf2ee;
  padding: 0 1rem 1rem;
  background: #fcfdfc;
}
.advanced-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .75rem;
}
.advanced-summary-card {
  display: grid;
  gap: .3rem;
  border: 1px solid #e5ebe7;
  border-radius: 18px;
  background: #fff;
  padding: .9rem;
}
.advanced-summary-card > strong {
  font-size: 1.45rem;
  font-weight: 930;
  letter-spacing: -.03em;
}
.comparison-compact-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .8rem;
}
.comparison-compact-card {
  display: grid;
  gap: .75rem;
  border: 1px solid #e5ebe7;
  border-radius: 18px;
  background: #fff;
  padding: .9rem;
}
.comparison-meter {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 42px;
  gap: .55rem;
  align-items: center;
}
.comparison-meter > span {
  color: #66736b;
  font-size: .7rem;
  font-weight: 850;
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

.plantel-list {
  display: grid;
  gap: .85rem;
}
.plantel-card {
  overflow: hidden;
  border: 1px solid #dfe8e1;
  border-radius: 22px;
  background: #fff;
}
.plantel-card-shell {
  display: grid;
  gap: .85rem;
  padding: 1rem;
}
.plantel-card-top {
  display: flex;
  gap: 1rem;
  align-items: start;
  justify-content: space-between;
}
.plantel-identity {
  display: grid;
  gap: .18rem;
  min-width: 0;
}
.plantel-identity h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 950;
  letter-spacing: -.035em;
}
.plantel-score {
  display: grid;
  gap: .18rem;
  text-align: right;
}
.plantel-score strong {
  font-size: 1.6rem;
  font-weight: 950;
  letter-spacing: -.04em;
}
.plantel-meter { display: grid; }

.quality-strip {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
}
.quality-chip {
  display: inline-flex;
  flex: 0 0 auto;
  gap: .45rem;
  align-items: center;
  min-height: 34px;
  border: 1px solid #dbe5e8;
  border-radius: 999px;
  background: #fff;
  padding: .35rem .45rem .35rem .72rem;
  color: #3b4960;
  font-size: .72rem;
  font-weight: 820;
  white-space: nowrap;
}
.quality-chip strong {
  display: grid;
  min-width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: #edf3ef;
  color: #4d5e71;
  font-size: .7rem;
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

.plantel-breakdown {
  border-top: 1px solid #e7eee9;
}
.plantel-breakdown summary {
  display: flex;
  gap: .55rem;
  align-items: center;
  justify-content: space-between;
  padding: .75rem 1rem;
  color: #526158;
  cursor: pointer;
  font-size: .76rem;
  font-weight: 860;
  list-style: none;
}
.plantel-breakdown summary::-webkit-details-marker { display: none; }
.breakdown-body {
  display: grid;
  gap: .95rem;
  border-top: 1px solid #edf1ee;
  padding: 1rem;
  background: #fcfdfc;
}
.detail-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .65rem;
}
.detail-metric-card {
  display: grid;
  gap: .25rem;
  border: 1px solid #e3eae5;
  border-radius: 14px;
  background: #fff;
  padding: .75rem;
}
.detail-metric-card > strong {
  font-size: 1.05rem;
  font-weight: 920;
}
.detail-metric-card.is-wide { grid-column: span 2; }
.detail-metric-copy {
  font-size: .78rem;
  font-weight: 800;
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
  .comparison-compact-list,
  .detail-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-metric-card.is-wide { grid-column: span 2; }
}

@media (max-width: 900px) {
  .summary-grid,
  .advanced-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .population-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .calm-chart-axis { margin-left: 0; }
}

@media (max-width: 720px) {
  .progress-report-page { padding: .75rem; }
  .report-toolbar { align-items: start; flex-direction: column; }
  .report-actions { width: 100%; justify-content: flex-start; }
  .scope-toggle { order: -1; width: 100%; }
  .cycle-control { flex: 1 1 160px; }
  .cycle-control select { width: 100%; }
  .section-heading,
  .plantel-card-top,
  .calm-row-head { flex-direction: column; align-items: start; }
  .section-heading > span,
  .plantel-score { text-align: left; }
  .comparison-compact-list,
  .field-columns,
  .detail-metric-grid { grid-template-columns: 1fr; }
  .detail-metric-card.is-wide { grid-column: auto; }
  .population-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .calm-chart-axis { display: none; }
}

@media (max-width: 480px) {
  .summary-grid,
  .advanced-summary-grid,
  .population-strip { grid-template-columns: 1fr 1fr; }
  .summary-card { min-height: 84px; }
  .summary-card > strong,
  .plantel-score strong { font-size: 1.45rem; }
  .load-monitor-row { grid-template-columns: minmax(0, 1fr) auto; }
  .load-monitor-row > span { display: none; }
  .comparison-meter { grid-template-columns: 58px minmax(0, 1fr) 40px; gap: .45rem; }
  .quality-strip { gap: .4rem; }
}
</style>
