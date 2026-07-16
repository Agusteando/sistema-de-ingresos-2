<template>
  <div class="progress-report-page">
    <header class="report-toolbar">
      <div class="report-title">
        <span>Control Escolar</span>
        <h1>Avance por plantel</h1>
      </div>

      <div class="report-actions">
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
          <strong>{{ loading ? `Plantel ${currentPlantel || '…'}` : loadSummaryLabel }}</strong>
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
        <span>Evaluados</span>
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

    <section class="plantel-section">
      <header class="section-heading">
        <h2>Planteles</h2>
        <span>{{ successfulReports.length }} disponibles</span>
      </header>

      <div class="plantel-list">
        <article
          v-for="item in visibleQueueRows"
          :key="item.plantel"
          :class="['plantel-card', `is-${item.status}`]"
        >
          <header class="plantel-card-header">
            <div class="plantel-identity">
              <span>Plantel</span>
              <h3>{{ item.plantel }}</h3>
              <span :class="['status-pill', `is-${item.status}`]">{{ queueStatusLabel(item) }}</span>
            </div>
            <div v-if="reportFor(item.plantel)" class="plantel-head-metrics">
              <div>
                <span>Evaluados</span>
                <strong>{{ formatNumber(reportFor(item.plantel).population.evaluated) }}</strong>
              </div>
              <div>
                <span>Inscritos</span>
                <strong>{{ formatNumber(reportFor(item.plantel).population.inscritos) }}</strong>
              </div>
            </div>
          </header>

          <template v-if="reportFor(item.plantel)">
            <div class="plantel-progress-grid">
              <section class="progress-metric is-basic">
                <div class="progress-metric-head">
                  <div>
                    <span>Expediente básico</span>
                    <small>
                      {{ formatNumber(reportFor(item.plantel).basic.completeRecords) }}/{{ formatNumber(reportFor(item.plantel).population.evaluated) }} completos
                    </small>
                  </div>
                  <strong>{{ reportFor(item.plantel).basic.averagePercent }}%</strong>
                </div>
                <div class="metric-track">
                  <i :style="{ width: `${reportFor(item.plantel).basic.averagePercent}%` }"></i>
                </div>
              </section>

              <section class="progress-metric is-advanced">
                <div class="progress-metric-head">
                  <div>
                    <span>Expediente avanzado</span>
                    <small>
                      {{ formatNumber(reportFor(item.plantel).advanced.completeRecords) }}/{{ formatNumber(reportFor(item.plantel).population.evaluated) }} completos
                    </small>
                  </div>
                  <strong>{{ reportFor(item.plantel).advanced.averagePercent }}%</strong>
                </div>
                <div class="metric-track">
                  <i :style="{ width: `${reportFor(item.plantel).advanced.averagePercent}%` }"></i>
                </div>
              </section>
            </div>

            <div class="quality-strip" :aria-label="`Calidad de datos del plantel ${item.plantel}`">
              <div v-for="quality in qualityBreakdown(reportFor(item.plantel))" :key="quality.key" class="quality-chip">
                <span>{{ quality.label }}</span>
                <strong>{{ formatNumber(quality.count) }}</strong>
              </div>
            </div>

            <details class="plantel-breakdown">
              <summary>
                <span>Desglose de campos</span>
                <LucideChevronDown :size="18" />
              </summary>

              <div class="breakdown-body">
                <div class="population-strip">
                  <div><span>Internos</span><strong>{{ formatNumber(reportFor(item.plantel).population.internos) }}</strong></div>
                  <div><span>Externos</span><strong>{{ formatNumber(reportFor(item.plantel).population.externos) }}</strong></div>
                  <div><span>No inscritos</span><strong>{{ formatNumber(reportFor(item.plantel).population.noInscritos) }}</strong></div>
                  <div><span>Bajas</span><strong>{{ formatNumber(reportFor(item.plantel).population.bajas) }}</strong></div>
                  <div><span>Sin ficha</span><strong>{{ formatNumber(reportFor(item.plantel).population.withoutOverlay) }}</strong></div>
                </div>

                <div class="field-columns">
                  <section class="field-tier">
                    <header>
                      <h4>Expediente básico</h4>
                      <strong>{{ reportFor(item.plantel).basic.averagePercent }}%</strong>
                    </header>
                    <div class="field-list">
                      <div v-for="field in reportFor(item.plantel).basic.fields" :key="field.key" class="field-row">
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
                      <strong>{{ reportFor(item.plantel).advanced.averagePercent }}%</strong>
                    </header>
                    <div class="field-list">
                      <div v-for="field in reportFor(item.plantel).advanced.fields" :key="field.key" class="field-row">
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
          </template>

          <div v-else class="plantel-state">
            <LucideLoader2 v-if="item.status === 'loading'" class="spinning" :size="18" />
            <LucideClock3 v-else :size="18" />
            <span>{{ queueStatusLabel(item) }}</span>
          </div>
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
  LucideClock3,
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

const reportFor = (plantel) => reports.value.find((report) => report.agentId === plantel) || null
const successfulReports = computed(() => planteles.value.map((item) => reportFor(item.agentId)).filter(Boolean))
const visibleQueueRows = computed(() => queueRows.value.filter((item) => item.status !== 'error'))
const processedCount = computed(() => queueRows.value.filter((item) => ['success', 'error'].includes(item.status)).length)
const loadingPercent = computed(() => queueRows.value.length ? Math.round((processedCount.value / queueRows.value.length) * 100) : 0)
const loadSummaryLabel = computed(() => `${successfulReports.value.length} planteles listos`)

const emptyTier = () => ({
  completedFields: 0,
  possibleFields: 0,
  averagePercent: 0,
  completeRecords: 0,
  incompleteRecords: 0,
})

const aggregateTier = (key) => {
  let completedFields = 0
  let possibleFields = 0
  let completeRecords = 0
  let incompleteRecords = 0

  successfulReports.value.forEach((report) => {
    const tier = report[key] || emptyTier()
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
  Object.keys(total).forEach((key) => { total[key] += Number(report.population?.[key] || 0) })
  return total
}, {
  totalVisible: 0,
  evaluated: 0,
  inscritos: 0,
  internos: 0,
  externos: 0,
  noInscritos: 0,
  bajas: 0,
  withoutOverlay: 0,
}))

const formatNumber = (value) => new Intl.NumberFormat('es-MX').format(Number(value || 0))
const sourceLabel = (source = {}) => {
  if (source.bridgeFallback) return `respaldo verificado (${source.base || 'cache'})`
  if (source.cacheFreshness === 'live-bridge') return 'bridge en vivo'
  return source.base || source.cacheFreshness || 'Control Escolar'
}
const queueStatusLabel = (item) => ({
  pending: 'En espera',
  loading: 'Consultando',
  success: 'Listo',
  error: 'Error',
  cancelled: 'Detenido',
}[item.status] || item.status)

const qualityBreakdown = (report) => {
  const quality = report?.quality || {}
  const basicFields = new Map((report?.basic?.fields || []).map((field) => [field.key, Number(field.missing || 0)]))
  return [
    { key: 'incomplete', label: 'Expediente incompleto', count: quality.incomplete ?? report?.basic?.incompleteRecords ?? 0 },
    { key: 'curp', label: 'Sin CURP', count: quality.sinCurp ?? basicFields.get('curp') ?? 0 },
    { key: 'grupo', label: 'Sin grupo', count: quality.sinGrupo ?? basicFields.get('grupo') ?? 0 },
    { key: 'padre', label: 'Sin datos de padre', count: quality.sinPadre ?? 0 },
    { key: 'madre', label: 'Sin datos de madre', count: quality.sinMadre ?? 0 },
    { key: 'contact', label: 'Sin contacto válido', count: quality.sinContacto ?? 0 },
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
  queueRows.value = queueRows.value.map((item) => item.status === 'loading' ? { ...item, status: 'cancelled' } : item)
  loading.value = false
  currentPlantel.value = ''
}
const downloadCsv = () => {
  const rows = successfulReports.value.map((report) => {
    const quality = Object.fromEntries(qualityBreakdown(report).map((item) => [item.key, item.count]))
    return {
      Plantel: report.agentId,
      Ciclo: selectedCiclo.value,
      Evaluados: report.population.evaluated,
      Inscritos: report.population.inscritos,
      Internos: report.population.internos,
      Externos: report.population.externos,
      'Expediente básico (%)': report.basic.averagePercent,
      'Básicos completos': report.basic.completeRecords,
      'Expediente avanzado (%)': report.advanced.averagePercent,
      'Avanzados completos': report.advanced.completeRecords,
      'Expediente incompleto': quality.incomplete,
      'Sin CURP': quality.curp,
      'Sin grupo': quality.grupo,
      'Sin datos de padre': quality.padre,
      'Sin datos de madre': quality.madre,
      'Sin contacto válido': quality.contact,
      'Sin ficha matrícula': report.population.withoutOverlay,
      Fuente: sourceLabel(report.source),
    }
  })
  exportToCSV(`avance-control-escolar-${selectedCiclo.value}.csv`, rows)
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
.report-actions button,
.summary-card button,
.plantel-state button {
  min-height: 40px;
  border: 1px solid #cfdcd1;
  border-radius: 12px;
  background: #fff;
  color: #24344c;
  font-weight: 820;
}

.report-actions select { padding: 0 .75rem; }
.report-actions button,
.summary-card button,
.plantel-state button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  padding: 0 .78rem;
  cursor: pointer;
}
.report-actions button.primary {
  border-color: #27733a;
  background: #27733a;
  color: #fff;
}
.report-actions button:disabled,
.summary-card button:disabled,
.plantel-state button:disabled {
  cursor: not-allowed;
  opacity: .55;
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
.metric-track,
.field-track {
  overflow: hidden;
  border-radius: 999px;
  background: #e6eee8;
}
.overall-track { height: 7px; margin-top: .6rem; }
.overall-track i,
.metric-track i,
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

.plantel-list { display: grid; gap: .72rem; }
.plantel-card {
  overflow: hidden;
  border: 1px solid #dfe8e1;
  border-radius: 17px;
  background: #fff;
}
.plantel-card.is-loading { border-color: #bfd5e6; }

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
.status-pill {
  display: inline-flex;
  border-radius: 999px;
  background: #eef2ef;
  padding: .28rem .5rem;
  color: #67736b;
  font-size: .65rem;
  font-weight: 850;
}
.status-pill.is-success { background: #e7f4e8; color: #23743a; }
.status-pill.is-loading { background: #e8f1fb; color: #286a9e; }

.plantel-head-metrics {
  display: flex;
  gap: .65rem;
}
.plantel-head-metrics > div {
  display: grid;
  min-width: 74px;
  text-align: right;
}
.plantel-head-metrics strong { font-size: 1rem; }

.plantel-progress-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .7rem;
  padding: .8rem .9rem .65rem;
}
.progress-metric {
  border: 1px solid #e2e9e3;
  border-radius: 14px;
  padding: .72rem;
  background: #fbfdfb;
}
.progress-metric-head {
  display: flex;
  gap: .75rem;
  align-items: start;
  justify-content: space-between;
}
.progress-metric-head span {
  display: block;
  font-size: .78rem;
  font-weight: 850;
}
.progress-metric-head small {
  display: block;
  margin-top: .15rem;
  color: #77847b;
  font-size: .67rem;
}
.progress-metric-head > strong {
  color: #247139;
  font-size: 1.3rem;
  font-weight: 950;
  letter-spacing: -.04em;
}
.metric-track { height: 9px; margin-top: .55rem; }
.progress-metric.is-advanced .metric-track i,
.field-tier.is-advanced .field-track i {
  background: linear-gradient(90deg, #315f82, #5b8fb1);
}
.progress-metric.is-advanced .progress-metric-head > strong { color: #315f82; }

.quality-strip {
  display: flex;
  gap: .45rem;
  overflow-x: auto;
  padding: .15rem .9rem .85rem;
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

.plantel-breakdown {
  border-top: 1px solid #e4ebe5;
}
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

.plantel-state {
  display: flex;
  gap: .55rem;
  align-items: center;
  min-height: 76px;
  justify-content: center;
  padding: .9rem;
  color: #738078;
  font-size: .78rem;
  font-weight: 800;
}
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
  .cycle-control { flex: 1 1 160px; }
  .cycle-control select { width: 100%; }
  .plantel-card-header { align-items: start; }
  .plantel-progress-grid,
  .field-columns { grid-template-columns: 1fr; }
  .population-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
  .summary-grid { grid-template-columns: 1fr 1fr; }
  .summary-card { min-height: 78px; }
  .summary-card > strong { font-size: 1.5rem; }
  .plantel-card-header { display: grid; }
  .plantel-head-metrics { justify-content: flex-start; }
  .plantel-head-metrics > div { text-align: left; }
  .plantel-identity { flex-wrap: wrap; }
  .load-monitor-row { grid-template-columns: minmax(0, 1fr) auto; }
  .load-monitor-row > span { display: none; }
}
</style>
