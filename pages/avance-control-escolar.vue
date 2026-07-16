<template>
  <div class="progress-report-page">
    <section class="report-hero">
      <div class="report-hero-copy">
        <span>Reporte consolidado</span>
        <h1>Avance de Control Escolar</h1>
        <p>
          Expediente básico, expediente avanzado y desglose completo de todos los planteles autorizados.
          La carga se ejecuta de forma secuencial para mantener una sola consulta activa contra el bridge.
        </p>
      </div>

      <div class="report-actions">
        <label>
          <small>Ciclo escolar</small>
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
    </section>

    <section v-if="loading || queueRows.length" class="load-monitor" aria-live="polite">
      <div class="load-monitor-head">
        <div>
          <small>Carga protegida</small>
          <h2>{{ loading ? `Consultando plantel ${currentPlantel || '…'}` : loadSummaryLabel }}</h2>
          <p>
            {{ processedCount }} de {{ queueRows.length }} planteles procesados.
            <template v-if="loading">Solo hay una solicitud activa; al terminar se libera el bridge antes de continuar.</template>
          </p>
        </div>
        <strong>{{ loadingPercent }}%</strong>
      </div>
      <div class="overall-track" role="progressbar" :aria-valuenow="loadingPercent" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ width: `${loadingPercent}%` }"></i>
      </div>
      <div class="plantel-queue" aria-label="Progreso por plantel">
        <div v-for="item in queueRows" :key="item.plantel" :class="['queue-item', `is-${item.status}`]">
          <span>
            <LucideLoader2 v-if="item.status === 'loading'" class="spinning" :size="15" />
            <LucideCheck v-else-if="item.status === 'success'" :size="15" />
            <LucideTriangleAlert v-else-if="item.status === 'error'" :size="15" />
            <LucideClock3 v-else :size="15" />
          </span>
          <b>{{ item.plantel }}</b>
          <small>{{ queueStatusLabel(item) }}</small>
        </div>
      </div>
    </section>

    <div v-if="pageError" class="report-error">
      <LucideTriangleAlert :size="19" />
      <div>
        <strong>No se pudo preparar el reporte.</strong>
        <p>{{ pageError }}</p>
      </div>
    </div>

    <section class="summary-grid">
      <article class="summary-card primary-metric">
        <div class="metric-ring" :style="ringStyle(globalBasic.averagePercent)">
          <strong>{{ globalBasic.averagePercent }}%</strong>
          <span>promedio</span>
        </div>
        <div>
          <small>Expediente básico</small>
          <h2>{{ formatNumber(globalBasic.completedFields) }} de {{ formatNumber(globalBasic.possibleFields) }} campos</h2>
          <p>
            {{ formatNumber(globalBasic.completeRecords) }} expedientes totalmente completos de
            {{ formatNumber(globalPopulation.evaluated) }} evaluados.
          </p>
        </div>
      </article>

      <article class="summary-card primary-metric advanced">
        <div class="metric-ring" :style="ringStyle(globalAdvanced.averagePercent)">
          <strong>{{ globalAdvanced.averagePercent }}%</strong>
          <span>promedio</span>
        </div>
        <div>
          <small>Expediente avanzado</small>
          <h2>{{ formatNumber(globalAdvanced.completedFields) }} de {{ formatNumber(globalAdvanced.possibleFields) }} campos</h2>
          <p>
            {{ formatNumber(globalAdvanced.completeRecords) }} expedientes avanzados completos de
            {{ formatNumber(globalPopulation.evaluated) }} evaluados.
          </p>
        </div>
      </article>

      <article class="summary-card compact">
        <small>Alumnos evaluados</small>
        <strong>{{ formatNumber(globalPopulation.evaluated) }}</strong>
        <span>{{ successfulReports.length }} planteles disponibles</span>
      </article>
      <article class="summary-card compact">
        <small>Expedientes básicos completos</small>
        <strong>{{ globalBasic.completeRecordPercent }}%</strong>
        <span>{{ formatNumber(globalBasic.completeRecords) }} alumnos</span>
      </article>
      <article class="summary-card compact">
        <small>Sin ficha matrícula</small>
        <strong>{{ formatNumber(globalPopulation.withoutOverlay) }}</strong>
        <span>de {{ formatNumber(globalPopulation.totalVisible) }} visibles</span>
      </article>
      <article class="summary-card compact" :class="{ warning: failedCount > 0 }">
        <small>Planteles con error</small>
        <strong>{{ failedCount }}</strong>
        <button v-if="failedCount && !loading" type="button" @click="retryFailed">
          Reintentar pendientes
        </button>
        <span v-else>{{ successfulReports.length }} cargados correctamente</span>
      </article>
    </section>

    <section class="report-panel">
      <header class="panel-header">
        <div>
          <small>Comparativo</small>
          <h2>Avance por plantel</h2>
          <p>Los porcentajes de avance son ponderados por campos completados, no un promedio simple de alumnos.</p>
        </div>
        <span>{{ successfulReports.length }}/{{ queueRows.length || planteles.length }} disponibles</span>
      </header>

      <div class="table-scroller">
        <table class="plantel-table">
          <thead>
            <tr>
              <th>Plantel</th>
              <th>Estado</th>
              <th class="number">Evaluados</th>
              <th>Básico promedio</th>
              <th class="number">Básicos completos</th>
              <th>Avanzado promedio</th>
              <th class="number">Avanzados completos</th>
              <th class="number">Sin ficha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in queueRows" :key="item.plantel">
              <td><strong>Plantel {{ item.plantel }}</strong></td>
              <td>
                <span :class="['status-pill', `is-${item.status}`]">{{ queueStatusLabel(item) }}</span>
              </td>
              <template v-if="reportFor(item.plantel)">
                <td class="number">{{ formatNumber(reportFor(item.plantel).population.evaluated) }}</td>
                <td>
                  <div class="inline-progress is-basic">
                    <div class="inline-progress-head"><strong>{{ reportFor(item.plantel).basic.averagePercent }}%</strong></div>
                    <div class="inline-progress-track"><i :style="{ width: `${reportFor(item.plantel).basic.averagePercent}%` }"></i></div>
                  </div>
                </td>
                <td class="number">
                  {{ formatNumber(reportFor(item.plantel).basic.completeRecords) }}
                  <small>{{ reportFor(item.plantel).basic.completeRecordPercent }}%</small>
                </td>
                <td>
                  <div class="inline-progress is-advanced">
                    <div class="inline-progress-head"><strong>{{ reportFor(item.plantel).advanced.averagePercent }}%</strong></div>
                    <div class="inline-progress-track"><i :style="{ width: `${reportFor(item.plantel).advanced.averagePercent}%` }"></i></div>
                  </div>
                </td>
                <td class="number">
                  {{ formatNumber(reportFor(item.plantel).advanced.completeRecords) }}
                  <small>{{ reportFor(item.plantel).advanced.completeRecordPercent }}%</small>
                </td>
                <td class="number">{{ formatNumber(reportFor(item.plantel).population.withoutOverlay) }}</td>
              </template>
              <template v-else>
                <td colspan="6" class="empty-cell">
                  {{ item.error || (item.status === 'loading' ? 'Consultando datos…' : 'Pendiente de consulta') }}
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="report-panel breakdown-panel">
      <header class="panel-header">
        <div>
          <small>Consolidado</small>
          <h2>Desglose global por campo</h2>
          <p>Cumplimiento acumulado de todos los alumnos evaluados en los planteles cargados.</p>
        </div>
        <div class="tier-switch" role="group" aria-label="Tipo de expediente">
          <button type="button" :class="{ active: activeTier === 'basic' }" @click="activeTier = 'basic'">Básico</button>
          <button type="button" :class="{ active: activeTier === 'advanced' }" @click="activeTier = 'advanced'">Avanzado</button>
        </div>
      </header>

      <div v-if="activeGlobalTier.fields.length" class="field-grid">
        <article v-for="field in activeGlobalTier.fields" :key="field.key" class="field-card">
          <div>
            <strong>{{ field.label }}</strong>
            <span>{{ formatNumber(field.completed) }} completos · {{ formatNumber(field.missing) }} pendientes</span>
          </div>
          <b>{{ field.percent }}%</b>
          <div class="field-track"><i :style="{ width: `${field.percent}%` }"></i></div>
        </article>
      </div>
      <div v-else class="empty-state">El desglose aparecerá conforme terminen los planteles.</div>
    </section>

    <section class="report-panel">
      <header class="panel-header">
        <div>
          <small>Detalle completo</small>
          <h2>Desglose por plantel</h2>
          <p>Abre un plantel para revisar cada campo básico y avanzado, además de su distribución escolar.</p>
        </div>
      </header>

      <div class="plantel-details">
        <details v-for="report in successfulReports" :key="report.agentId" class="plantel-detail">
          <summary>
            <div>
              <span>Plantel {{ report.agentId }}</span>
              <strong>{{ report.basic.averagePercent }}% básico · {{ report.advanced.averagePercent }}% avanzado</strong>
            </div>
            <small>{{ formatNumber(report.population.evaluated) }} evaluados</small>
            <LucideChevronDown :size="18" />
          </summary>

          <div class="detail-body">
            <div class="detail-metrics">
              <div><span>Inscritos</span><strong>{{ formatNumber(report.population.inscritos) }}</strong></div>
              <div><span>Internos</span><strong>{{ formatNumber(report.population.internos) }}</strong></div>
              <div><span>Externos</span><strong>{{ formatNumber(report.population.externos) }}</strong></div>
              <div><span>Sin ficha</span><strong>{{ formatNumber(report.population.withoutOverlay) }}</strong></div>
            </div>

            <div class="detail-columns">
              <div>
                <h3>Expediente básico</h3>
                <div class="compact-field-list">
                  <div v-for="field in report.basic.fields" :key="field.key" class="compact-field-row">
                    <div><span>{{ field.label }}</span><small>{{ field.completed }}/{{ field.total }}</small></div>
                    <strong>{{ field.percent }}%</strong>
                    <div class="compact-field-track"><i :style="{ width: `${field.percent}%` }"></i></div>
                  </div>
                </div>
              </div>
              <div>
                <h3>Expediente avanzado</h3>
                <div class="compact-field-list">
                  <div v-for="field in report.advanced.fields" :key="field.key" class="compact-field-row">
                    <div><span>{{ field.label }}</span><small>{{ field.completed }}/{{ field.total }}</small></div>
                    <strong>{{ field.percent }}%</strong>
                    <div class="compact-field-track"><i :style="{ width: `${field.percent}%` }"></i></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="distribution-grid">
              <div>
                <h3>Por nivel</h3>
                <ul>
                  <li v-for="item in report.distribution.byNivel" :key="item.label">
                    <span>{{ item.label }}</span><strong>{{ formatNumber(item.total) }}</strong>
                  </li>
                </ul>
              </div>
              <div>
                <h3>Principales grupos</h3>
                <ul>
                  <li v-for="item in report.distribution.byGrupo.slice(0, 12)" :key="item.label">
                    <span>{{ item.label }}</span><strong>{{ formatNumber(item.total) }}</strong>
                  </li>
                </ul>
              </div>
            </div>

            <p class="source-note">
              Fuente: {{ sourceLabel(report.source) }} · generado {{ formatDateTime(report.generatedAt) }}
            </p>
          </div>
        </details>
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
const activeTier = ref('basic')
let currentController = null
let currentRunId = 0

const reportFor = (plantel) => reports.value.find((report) => report.agentId === plantel) || null
const successfulReports = computed(() => planteles.value.map((item) => reportFor(item.agentId)).filter(Boolean))
const failedCount = computed(() => queueRows.value.filter((item) => item.status === 'error').length)
const processedCount = computed(() => queueRows.value.filter((item) => ['success', 'error'].includes(item.status)).length)
const loadingPercent = computed(() => queueRows.value.length ? Math.round((processedCount.value / queueRows.value.length) * 100) : 0)
const loadSummaryLabel = computed(() => failedCount.value
  ? `${successfulReports.value.length} planteles listos; ${failedCount.value} con error`
  : `${successfulReports.value.length} planteles cargados`)

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

const aggregateTier = (key) => {
  const rows = successfulReports.value
  const fieldMap = new Map()
  let completedFields = 0
  let possibleFields = 0
  let completeRecords = 0
  let incompleteRecords = 0
  let fieldCount = 0

  rows.forEach((report) => {
    const tier = report[key] || emptyTier()
    fieldCount = Math.max(fieldCount, Number(tier.fieldCount || 0))
    completedFields += Number(tier.completedFields || 0)
    possibleFields += Number(tier.possibleFields || 0)
    completeRecords += Number(tier.completeRecords || 0)
    incompleteRecords += Number(tier.incompleteRecords || 0)
    ;(tier.fields || []).forEach((field) => {
      const current = fieldMap.get(field.key) || {
        key: field.key,
        label: field.label,
        completed: 0,
        missing: 0,
        total: 0,
      }
      current.completed += Number(field.completed || 0)
      current.missing += Number(field.missing || 0)
      current.total += Number(field.total || 0)
      fieldMap.set(field.key, current)
    })
  })

  const totalRecords = completeRecords + incompleteRecords
  return {
    fieldCount,
    completedFields,
    possibleFields,
    averagePercent: possibleFields ? Math.round((completedFields / possibleFields) * 100) : 0,
    completeRecords,
    incompleteRecords,
    completeRecordPercent: totalRecords ? Math.round((completeRecords / totalRecords) * 100) : 0,
    fields: Array.from(fieldMap.values()).map((field) => ({
      ...field,
      percent: field.total ? Math.round((field.completed / field.total) * 100) : 0,
    })),
  }
}

const globalBasic = computed(() => aggregateTier('basic'))
const globalAdvanced = computed(() => aggregateTier('advanced'))
const activeGlobalTier = computed(() => activeTier.value === 'advanced' ? globalAdvanced.value : globalBasic.value)
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
const formatDateTime = (value) => {
  if (!value) return 'sin fecha'
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return String(value)
  }
}
const ringStyle = (value) => ({ '--ring-progress': `${Math.max(0, Math.min(100, Number(value || 0)))}%` })
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
      console.warn('[Reporte Control Escolar] Configuración de inscripción no disponible; se usará el alcance base.', configError)
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
const retryFailed = () => runQueue(queueRows.value.filter((item) => item.status === 'error'))
const cancelLoad = () => {
  currentController?.abort()
  queueRows.value = queueRows.value.map((item) => item.status === 'loading' ? { ...item, status: 'cancelled' } : item)
  loading.value = false
  currentPlantel.value = ''
}
const downloadCsv = () => {
  const rows = successfulReports.value.map((report) => ({
    Plantel: report.agentId,
    Ciclo: selectedCiclo.value,
    Evaluados: report.population.evaluated,
    Inscritos: report.population.inscritos,
    Internos: report.population.internos,
    Externos: report.population.externos,
    'Expediente básico promedio (%)': report.basic.averagePercent,
    'Expedientes básicos completos': report.basic.completeRecords,
    'Expedientes básicos completos (%)': report.basic.completeRecordPercent,
    'Expediente avanzado promedio (%)': report.advanced.averagePercent,
    'Expedientes avanzados completos': report.advanced.completeRecords,
    'Expedientes avanzados completos (%)': report.advanced.completeRecordPercent,
    'Sin ficha matrícula': report.population.withoutOverlay,
    Fuente: sourceLabel(report.source),
  }))
  exportToCSV(`avance-control-escolar-${selectedCiclo.value}.csv`, rows)
}

onMounted(prepareReport)
onBeforeUnmount(() => currentController?.abort())
</script>

<style scoped>
.progress-report-page {
  display: grid;
  gap: 1rem;
  min-height: 100%;
  padding: 1rem;
  color: #17233a;
}

.report-hero,
.load-monitor,
.report-panel,
.summary-card {
  border: 1px solid rgba(210, 224, 214, .92);
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 16px 42px rgba(29, 58, 76, .07);
}

.report-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1.25rem;
  align-items: end;
  border-radius: 26px;
  padding: 1.35rem;
  background:
    radial-gradient(circle at top right, rgba(87, 174, 93, .14), transparent 30rem),
    linear-gradient(135deg, #ffffff, #f6fbf7);
}

.report-hero-copy > span,
.panel-header small,
.summary-card > small,
.primary-metric small,
.load-monitor small,
.report-actions small {
  color: #28723a;
  font-size: .68rem;
  font-weight: 900;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.report-hero h1 {
  margin: .2rem 0 0;
  color: #142039;
  font-size: clamp(1.85rem, 3vw, 2.7rem);
  font-weight: 920;
  letter-spacing: -.045em;
}

.report-hero p,
.panel-header p,
.load-monitor p,
.report-error p,
.primary-metric p {
  margin: .5rem 0 0;
  color: #627087;
  line-height: 1.55;
}

.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .55rem;
  align-items: end;
  justify-content: flex-end;
}

.report-actions label {
  display: grid;
  gap: .3rem;
}

.report-actions select,
.report-actions button,
.tier-switch button,
.summary-card button {
  min-height: 42px;
  border: 1px solid #cfdcd1;
  border-radius: 13px;
  background: #fff;
  color: #24344c;
  font-weight: 820;
}

.report-actions select { padding: 0 .8rem; }
.report-actions button {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  padding: 0 .85rem;
  cursor: pointer;
}
.report-actions button.primary {
  border-color: #27733a;
  background: #27733a;
  color: white;
}
.report-actions button:disabled,
.summary-card button:disabled { cursor: not-allowed; opacity: .55; }

.load-monitor {
  border-radius: 22px;
  padding: 1rem;
}

.load-monitor-head {
  display: flex;
  gap: 1rem;
  align-items: start;
  justify-content: space-between;
}
.load-monitor h2,
.panel-header h2 {
  margin: .18rem 0 0;
  color: #18243a;
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: -.025em;
}
.load-monitor-head > strong {
  color: #21733a;
  font-size: 1.65rem;
  font-weight: 950;
}

.overall-track,
.field-track,
.inline-progress-track,
.compact-field-track {
  overflow: hidden;
  border-radius: 999px;
  background: #e6eee8;
}
.overall-track { height: 10px; margin-top: .85rem; }
.overall-track i,
.field-track i,
.inline-progress-track i,
.compact-field-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2b7c3e, #62a952);
  transition: width .28s ease;
}

.plantel-queue {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(122px, 1fr));
  gap: .55rem;
  margin-top: .85rem;
}
.queue-item {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: .1rem .45rem;
  align-items: center;
  border: 1px solid #dfe8e1;
  border-radius: 13px;
  padding: .55rem .65rem;
  background: #fafcfb;
}
.queue-item > span {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: #edf2ee;
  color: #718078;
}
.queue-item b { font-size: .82rem; }
.queue-item small {
  grid-column: 2;
  color: #77847b;
  font-size: .68rem;
  font-weight: 760;
  letter-spacing: normal;
  text-transform: none;
}
.queue-item.is-success > span { background: #e7f5e8; color: #23743a; }
.queue-item.is-loading > span { background: #e9f1fb; color: #2768a3; }
.queue-item.is-error > span { background: #fff0ed; color: #b24637; }

.report-error {
  display: flex;
  gap: .75rem;
  align-items: start;
  border: 1px solid #efc6bd;
  border-radius: 18px;
  background: #fff5f2;
  padding: .9rem 1rem;
  color: #a33d32;
}
.report-error p { color: #925b53; }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.summary-card {
  border-radius: 22px;
  padding: 1rem;
}
.summary-card.primary-metric {
  display: flex;
  grid-column: span 2;
  gap: 1rem;
  align-items: center;
}
.metric-ring {
  display: grid;
  width: 108px;
  height: 108px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  background:
    radial-gradient(circle, white 0 57%, transparent 58%),
    conic-gradient(#2c7f40 var(--ring-progress), #e4eee6 0);
  box-shadow: inset 0 0 0 1px #d8e6db;
}
.primary-metric.advanced .metric-ring {
  background:
    radial-gradient(circle, white 0 57%, transparent 58%),
    conic-gradient(#306d94 var(--ring-progress), #e4ebf0 0);
}
.metric-ring strong {
  align-self: end;
  font-size: 1.55rem;
  font-weight: 950;
  line-height: 1;
}
.metric-ring span {
  align-self: start;
  color: #6e7a72;
  font-size: .65rem;
  font-weight: 850;
  text-transform: uppercase;
}
.primary-metric h2 {
  margin: .22rem 0 0;
  font-size: 1.1rem;
  font-weight: 900;
  letter-spacing: -.025em;
}
.summary-card.compact {
  display: grid;
  align-content: center;
  gap: .35rem;
  min-height: 118px;
}
.summary-card.compact > strong {
  font-size: 1.9rem;
  font-weight: 950;
  line-height: 1;
}
.summary-card.compact > span { color: #6a7889; font-size: .78rem; font-weight: 720; }
.summary-card.compact.warning { border-color: #e8c7a5; background: #fffaf2; }
.summary-card button {
  justify-self: start;
  min-height: 32px;
  padding: 0 .65rem;
  cursor: pointer;
  color: #9b5a1d;
}

.report-panel {
  border-radius: 24px;
  padding: 1rem;
}
.panel-header {
  display: flex;
  gap: 1rem;
  align-items: start;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.panel-header > span {
  border-radius: 999px;
  background: #edf7ee;
  padding: .4rem .65rem;
  color: #28723a;
  font-size: .72rem;
  font-weight: 900;
  white-space: nowrap;
}
.table-scroller { overflow-x: auto; }
.plantel-table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
}
.plantel-table th,
.plantel-table td {
  border-bottom: 1px solid #e5ebe6;
  padding: .75rem .7rem;
  text-align: left;
  vertical-align: middle;
}
.plantel-table th {
  color: #62706a;
  font-size: .68rem;
  font-weight: 900;
  letter-spacing: .07em;
  text-transform: uppercase;
}
.plantel-table td { font-size: .83rem; }
.plantel-table .number { text-align: right; }
.plantel-table td.number small { display: block; color: #758079; }
.empty-cell { color: #7d8880; font-size: .78rem !important; }
.status-pill {
  display: inline-flex;
  border-radius: 999px;
  background: #eef2ef;
  padding: .3rem .55rem;
  color: #67736b;
  font-size: .68rem;
  font-weight: 850;
}
.status-pill.is-success { background: #e7f4e8; color: #23743a; }
.status-pill.is-loading { background: #e8f1fb; color: #286a9e; }
.status-pill.is-error { background: #fff0ed; color: #ad4336; }

.inline-progress { min-width: 116px; }
.inline-progress-head { display: flex; justify-content: flex-end; margin-bottom: .3rem; }
.inline-progress-head strong { font-size: .78rem; }
.inline-progress-track { height: 7px; }
.inline-progress.is-advanced .inline-progress-track i { background: linear-gradient(90deg, #315f82, #5b8fb1); }

.tier-switch {
  display: inline-flex;
  gap: .25rem;
  border: 1px solid #dce6de;
  border-radius: 13px;
  padding: .25rem;
  background: #f7faf8;
}
.tier-switch button {
  min-height: 34px;
  border: 0;
  padding: 0 .75rem;
  background: transparent;
  cursor: pointer;
}
.tier-switch button.active { background: #28743b; color: #fff; }
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .7rem;
}
.field-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: .55rem .75rem;
  border: 1px solid #e0e8e2;
  border-radius: 15px;
  padding: .75rem;
  background: #fbfdfb;
}
.field-card strong { display: block; font-size: .82rem; }
.field-card span { color: #758178; font-size: .7rem; }
.field-card > b { align-self: center; color: #256f39; font-size: .95rem; }
.field-track { grid-column: 1 / -1; height: 7px; }
.empty-state { padding: 2rem; text-align: center; color: #78847c; }

.plantel-details { display: grid; gap: .7rem; }
.plantel-detail {
  overflow: hidden;
  border: 1px solid #dfe8e1;
  border-radius: 17px;
  background: #fbfdfb;
}
.plantel-detail summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 20px;
  gap: .75rem;
  align-items: center;
  padding: .85rem 1rem;
  cursor: pointer;
  list-style: none;
}
.plantel-detail summary::-webkit-details-marker { display: none; }
.plantel-detail summary span { display: block; color: #2b733c; font-size: .7rem; font-weight: 900; text-transform: uppercase; }
.plantel-detail summary strong { display: block; margin-top: .18rem; font-size: .9rem; }
.plantel-detail summary small { color: #6e7b73; }
.plantel-detail[open] summary svg { transform: rotate(180deg); }
.detail-body {
  display: grid;
  gap: 1rem;
  border-top: 1px solid #e2e9e3;
  padding: 1rem;
  background: #fff;
}
.detail-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .65rem;
}
.detail-metrics div {
  display: grid;
  gap: .25rem;
  border-radius: 13px;
  background: #f3f8f4;
  padding: .65rem;
}
.detail-metrics span { color: #6c786f; font-size: .7rem; font-weight: 800; }
.detail-metrics strong { font-size: 1.1rem; }
.detail-columns,
.distribution-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.detail-columns h3,
.distribution-grid h3 {
  margin: 0 0 .65rem;
  font-size: .85rem;
  font-weight: 900;
}
.compact-field-list { display: grid; gap: .45rem; }
.compact-field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: .3rem .65rem;
}
.compact-field-row span { display: block; font-size: .75rem; font-weight: 760; }
.compact-field-row small { color: #7a867e; font-size: .66rem; }
.compact-field-row strong { font-size: .75rem; }
.compact-field-track { grid-column: 1 / -1; height: 6px; }
.distribution-grid ul { display: grid; gap: .35rem; margin: 0; padding: 0; list-style: none; }
.distribution-grid li {
  display: flex;
  gap: .75rem;
  justify-content: space-between;
  border-bottom: 1px solid #edf1ee;
  padding: .35rem 0;
  font-size: .75rem;
}
.source-note { margin: 0; color: #7b867f; font-size: .7rem; }
.spinning { animation: reportSpin .9s linear infinite; }

@keyframes reportSpin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-card.primary-metric { grid-column: span 1; }
}

@media (max-width: 760px) {
  .progress-report-page { padding: .7rem; }
  .report-hero { grid-template-columns: 1fr; align-items: start; }
  .report-actions { justify-content: flex-start; }
  .report-actions label { width: 100%; }
  .report-actions select { width: 100%; }
  .summary-grid,
  .field-grid,
  .detail-columns,
  .distribution-grid { grid-template-columns: 1fr; }
  .summary-card.primary-metric { grid-column: auto; }
  .panel-header { display: grid; }
  .tier-switch { justify-self: start; }
  .detail-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
  .summary-card.primary-metric { align-items: flex-start; }
  .metric-ring { width: 88px; height: 88px; }
  .metric-ring strong { font-size: 1.25rem; }
  .load-monitor-head { display: grid; }
  .plantel-detail summary { grid-template-columns: minmax(0, 1fr) 20px; }
  .plantel-detail summary > small { grid-column: 1; }
}
</style>
