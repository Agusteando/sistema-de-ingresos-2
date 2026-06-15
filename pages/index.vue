<template>
  <div class="students-screen">
    <StudentsHero
      @manage-sections="openSectionModal(null)"
      @new-student="openAlta"
    />

    <StudentsKpiSummary
      :user-role="userRole"
      :kpi-counts="kpiCounts"
      :active-filter="activeFilter"
      :custom-sections="customSections"
      :custom-section-counts="customSectionCounts"
      :global-kpis="globalKpis"
      :kpi-sparklines="kpiSparklines"
      :is-refreshing="isKpiRefreshing"
      @set-filter="setActiveFilter"
    />

    <StudentsFilterBar
      :search-query="filters.q"
      :active-kpi-filter-label="activeInlineFilterLabel"
      :active-grado="activeGrado"
      :active-grupo="activeGrupo"
      :active-saldo-filter="activeSaldoFilter"
      :available-grados="availableGrados"
      :available-grupos="availableGrupos"
      @update-search-query="filters.q = $event"
      @update-active-grado="activeGrado = $event"
      @update-active-grupo="activeGrupo = $event"
      @update-active-saldo-filter="activeSaldoFilter = $event"
      @clear-active-filter="clearActiveFilter"
      @toggle-debt="toggleSaldoDebtFilter"
      @search="performSearch"
      @export="exportData"
    />

    <div class="students-scale-shell">
      <div class="students-design-canvas">
        <div
          ref="studentsWorkspaceEl"
          :class="[
            'students-workspace',
            {
              'has-detail': hasAccountWorkspace,
              'is-resizing': workspaceResizing,
            },
          ]"
          :style="studentsWorkspaceStyle"
        >
          <StudentsListPanel
            :has-account-workspace="hasAccountWorkspace"
            :displayed-students="displayedStudents"
            :loading="loading"
            :selected-count="selectedCount"
            :all-displayed-selected="allDisplayedSelected"
            :some-displayed-selected="someDisplayedSelected"
            :has-active-filters="hasActiveFilters"
            :selected-student="selectedStudent"
            :selected-matriculas="selectedMatriculas"
            :external-concepts="externalConcepts"
            :tipo-ingreso-concepts="tipoIngresoConcepts.length ? tipoIngresoConcepts : externalConcepts"
            :target-ciclo="currentCicloKey"
            :photo-cache="photoCache"
            :source-unavailable="studentsSourceUnavailable"
            @open-section-selection="openSectionModalForSelection"
            @clear-filters="clearFilters"
            @toggle-displayed-selection="toggleDisplayedSelection"
            @toggle-student-selection="toggleStudentSelection"
            @student-row-click="handleStudentRowClick"
            @select-student="selectStudent"
            @show-student-menu="showStudentMenu"
            @refresh-source="refreshStudentsFromServer"
          />

          <button
            v-if="hasAccountWorkspace"
            type="button"
            class="students-workspace-resizer"
            :aria-label="workspaceResizerLabel"
            :aria-orientation="workspaceResizerOrientation"
            role="separator"
            :aria-valuenow="Math.round(workspaceResizerValue)"
            :aria-valuetext="workspaceResizerText"
            :aria-valuemin="workspaceResizerMin"
            :aria-valuemax="workspaceResizerMax"
            :title="workspaceResizerTitle"
            @pointerdown.prevent="startWorkspaceResize"
            @dblclick.prevent="resetWorkspaceSplit"
            @keydown.left.prevent="nudgeWorkspaceSplit(-2)"
            @keydown.right.prevent="nudgeWorkspaceSplit(2)"
            @keydown.up.prevent="nudgeWorkspaceStack(-2)"
            @keydown.down.prevent="nudgeWorkspaceStack(2)"
            @keydown.home.prevent="resetWorkspaceSplit"
            @keydown.end.prevent="resetWorkspaceSplit"
          >
            <span class="students-workspace-resizer-rail" aria-hidden="true">
              <i></i><i></i><i></i>
            </span>
          </button>

          <StudentsWorkspacePanel
            :account-workspace-mode="accountWorkspaceMode"
            :selected-student="selectedStudent"
            :selected-count="selectedCount"
            :selected-grade-summary="selectedGradeSummary"
            :selected-group-summary="selectedGroupSummary"
            :selected-balance-total="selectedBalanceTotal"
            :selected-average-balance="selectedAverageBalance"
            :selected-section-summary="selectedSectionSummary"
            :selected-students="selectedStudents"
            :bulk-payment-method="bulkPaymentMethod"
            :bulk-payment-total="bulkPaymentTotal"
            :bulk-payment-student-count="bulkPaymentStudentCount"
            :bulk-payment-debt-count="bulkPaymentDebtCount"
            :bulk-payment-rows="bulkPaymentRows"
            :bulk-payment-loading="bulkPaymentLoading"
            :bulk-payment-processing="bulkPaymentProcessing"
            :external-concepts="externalConcepts"
            :tipo-ingreso-concepts="tipoIngresoConcepts.length ? tipoIngresoConcepts : externalConcepts"
            @refresh="refreshStudentsAndKpis"
            @edit="openEdit"
            @close-detail="selectedStudent = null"
            @switch-student="selectStudentByMatricula"
            @photo-loaded="cacheStudentPhoto"
            @baja="bajaAlumno"
            @manage-sections="openSectionModal"
            @ingreso-cycle-updated="handleIngresoCycleUpdated"
            @close-bulk="closeBulkWorkspace"
            @open-bulk-payment="openBulkPaymentFlow"
            @open-section-selection="openSectionModalForSelection"
            @open-bulk-ingreso-cycle="openBulkIngresoCycleFlow"
            @open-no-adeudo="openNoAdeudoForSelection"
            @open-bulk-baja="openBulkBajaFlow"
            @clear-selected="clearSelectedStudents"
            @change-bulk-payment-method="bulkPaymentMethod = $event"
            @back-to-bulk="bulkWorkspaceMode = 'bulk'"
            @submit-bulk-payments="submitBulkPayments"
            @open-operator-info="openStudentOperatorInfo"
          />
        </div>
      </div>
    </div>

    <StudentsSelectionDock
      :selected-count="selectedCount"
      :selected-balance-total="selectedBalanceTotal"
      @open-selection-details="openSelectionDetails"
      @open-section-selection="openSectionModalForSelection"
      @open-bulk-ingreso-cycle="openBulkIngresoCycleFlow"
      @open-bulk-payment="openBulkPaymentFlow"
      @open-no-adeudo="openNoAdeudoForSelection"
      @open-bulk-baja="openBulkBajaFlow"
      @clear-selected="clearSelectedStudents"
    />

    <NoAdeudoModal
      v-if="noAdeudoStudents.length"
      :students="noAdeudoStudents"
      :ciclo="currentCicloKey"
      @close="noAdeudoStudents = []"
      @sent="handleNoAdeudoSent"
    />

    <StudentFormModal v-if="showStudentModal" :student="editingStudent" :enrollment-concepts="tipoIngresoConcepts.length ? tipoIngresoConcepts : externalConcepts" @close="closeStudentModal" @success="handleStudentSuccess" @ingreso-cycle-updated="handleIngresoCycleUpdated" />
    <BulkIngresoCycleModal
      v-if="showBulkIngresoCycleModal"
      :selected-students="selectedStudents"
      :target-ciclo="currentCicloKey"
      :saving="bulkIngresoSaving"
      :result="bulkIngresoResult"
      @close="closeBulkIngresoCycleModal"
      @confirm="submitBulkIngresoCycle"
      @remove-student="removeStudentFromSelection"
    />
    <BajaReasonModal
      v-if="pendingBajaStudent || pendingBulkBajaStudents.length"
      :student="pendingBajaStudent"
      :students="pendingBulkBajaStudents"
      :saving="bulkBajaSaving"
      @close="closeBajaModal"
      @confirm="confirmBaja"
    />
    <StudentOperatorInfoModal
      v-if="operatorInfoStudent"
      :student="operatorInfoStudent"
      @close="operatorInfoStudent = null"
    />

    <div
      v-if="showFinancialDiagnosticsModal"
      class="financial-diagnostics-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="financial-diagnostics-title"
      @click.self="closeFinancialDiagnosticsModal"
    >
      <section class="financial-diagnostics-modal">
        <header>
          <div>
            <small>Diagnóstico de sincronización</small>
            <h2 id="financial-diagnostics-title">Flujo financiero y enriquecimiento</h2>
          </div>
          <button type="button" class="detail-shell-close" @click="closeFinancialDiagnosticsModal">
            ×
          </button>
        </header>
        <div v-if="lastFinancialLoadDiagnostics" class="financial-diagnostics-body">
          <div class="diagnostics-hero-card">
            <div>
              <small>Lectura automática</small>
              <h3>Ruta de resolución financiera</h3>
              <p>
                El modal muestra el recorrido real de la última carga: caché del navegador,
                bridge/base del servidor, enriquecimiento central y el resultado visible final.
              </p>
            </div>
            <div class="diagnostics-query-pill">
              <span>{{ lastFinancialLoadDiagnostics.query || 'sin búsqueda' }}</span>
              <small>Ciclo {{ lastFinancialLoadDiagnostics.ciclo || 'n/a' }}</small>
            </div>
          </div>

          <div class="diagnostics-summary-grid">
            <article
              v-for="item in financialDiagnosticsSummary"
              :key="item.label"
              :class="['diagnostics-summary-card', `is-${item.tone || 'neutral'}`]"
            >
              <small>{{ item.label }}</small>
              <strong>{{ item.value }}</strong>
            </article>
          </div>

          <section class="diagnostics-section-card">
            <div class="diagnostics-section-card__head">
              <div>
                <small>Árbol de decisiones</small>
                <h3>Cómo navegó la resolución</h3>
              </div>
              <span class="diagnostics-inline-badge">{{ financialDiagnosticsTree.length }} nodos</span>
            </div>
            <div class="diagnostics-tree">
              <template v-for="(node, index) in financialDiagnosticsTree" :key="node.id">
                <article :class="['diagnostics-node', `is-${node.tone}`]">
                  <div class="diagnostics-node__rail">
                    <span class="diagnostics-node__lane">{{ node.laneLabel }}</span>
                    <span class="diagnostics-node__status">{{ node.statusLabel }}</span>
                  </div>
                  <div class="diagnostics-node__body">
                    <header>
                      <div>
                        <h4>{{ node.title }}</h4>
                        <p>{{ node.decision }}</p>
                      </div>
                      <span class="diagnostics-node__time">{{ formatFinancialDuration(node.ms) }}</span>
                    </header>
                    <p class="diagnostics-node__why"><b>Por qué:</b> {{ node.why }}</p>
                    <ul v-if="node.meta.length" class="diagnostics-node__meta">
                      <li v-for="item in node.meta" :key="`${node.id}-${item.label}`">
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </li>
                    </ul>
                  </div>
                </article>
                <div v-if="index < financialDiagnosticsTree.length - 1" class="diagnostics-tree__arrow">↓</div>
              </template>
            </div>
          </section>

          <section class="diagnostics-section-card diagnostics-section-card--compact">
            <div class="diagnostics-section-card__head">
              <div>
                <small>Estado actual</small>
                <h3>Resumen operativo</h3>
              </div>
            </div>
            <dl class="diagnostics-facts-grid">
              <div>
                <dt>Sync base</dt>
                <dd>{{ studentsSyncState.message || 'Sin mensaje registrado' }}</dd>
              </div>
              <div>
                <dt>Overlay visible</dt>
                <dd>{{ financialEnrichmentState.message || 'Sin mensaje registrado' }}</dd>
              </div>
              <div>
                <dt>Bridge</dt>
                <dd>{{ lastFinancialLoadDiagnostics.source.server.bridgeState || 'unknown' }}</dd>
              </div>
              <div>
                <dt>Flujo servidor</dt>
                <dd>{{ lastFinancialLoadDiagnostics.source.server.flow || 'n/a' }}</dd>
              </div>
              <div>
                <dt>Base rows</dt>
                <dd>{{ lastFinancialLoadDiagnostics.source.server.baseRows }}</dd>
              </div>
              <div>
                <dt>Overlay rows</dt>
                <dd>{{ lastFinancialLoadDiagnostics.source.server.overlayFound }}/{{ lastFinancialLoadDiagnostics.source.server.overlayRequested }}</dd>
              </div>
              <div>
                <dt>Visibles</dt>
                <dd>{{ students.length }}</dd>
              </div>
              <div>
                <dt>Pendientes</dt>
                <dd>{{ financialEnrichmentDiagnostics.pending }}</dd>
              </div>
            </dl>
          </section>
        </div>
        <div v-else class="diagnostics-empty-state">
          Aún no hay una carga registrada para este plantel.
        </div>
      </section>
    </div>

    <StudentSectionModal
      :show="showSectionModal"
      :section-modal-student="sectionModalStudent"
      :section-modal-students="sectionModalStudents"
      :new-section-name="newSectionName"
      :custom-sections="customSections"
      :custom-section-counts="customSectionCounts"
      :creating-section="creatingSection"
      :assigning-sections="assigningSections"
      :bulk-section-state="bulkSectionState"
      @close="closeSectionModal"
      @update-new-section-name="newSectionName = $event"
      @create-section="createCustomSection"
      @toggle-student-section="toggleStudentSection"
      @toggle-bulk-section="toggleBulkSection"
      @delete-section="deleteCustomSection"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { useHead } from '#imports'
import { LucideBookOpen, LucideEye, LucideSettings, LucideShieldCheck, LucideTag, LucideTags, LucideUserX } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { useStudentSelection } from '~/composables/useStudentSelection'
import { useStudentSections } from '~/composables/useStudentSections'
import { useStudentBulkPayments } from '~/composables/useStudentBulkPayments'
import { useStudentsCacheSync } from '~/composables/useStudentsCacheSync'
import { exportToCSV } from '~/utils/export'
import { resolveFinancialFamilyContact } from '~/shared/utils/familyContact'
import { GRADOS_ORDEN } from '~/utils/constants'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { formatTipoIngresoValue, resolveTipoIngreso } from '~/shared/utils/tipoIngreso'
import {
  formatMoney,
  gradeVisualTitle,
  isSectionFilter,
  normalizeStudentMatricula,
  normalizeEnrollmentConceptIds,
  normalizeEnrollmentPlantelKey,
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope,
  photoStorageKey,
  sectionIdFromFilter,
  studentGroupLabel,
  studentHasSection,
  studentNivelLabel,
  resolveControlEscolarProgress
} from '~/shared/utils/studentPresentation'
import StudentsHero from '~/components/students/StudentsHero.vue'
import StudentsKpiSummary from '~/components/students/StudentsKpiSummary.vue'
import StudentsFilterBar from '~/components/students/StudentsFilterBar.vue'
import StudentsListPanel from '~/components/students/StudentsListPanel.vue'
import StudentsWorkspacePanel from '~/components/students/StudentsWorkspacePanel.vue'
import StudentsSelectionDock from '~/components/students/StudentsSelectionDock.vue'
import StudentSectionModal from '~/components/students/StudentSectionModal.vue'
import BulkIngresoCycleModal from '~/components/BulkIngresoCycleModal.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'
import BajaReasonModal from '~/components/BajaReasonModal.vue'
import StudentOperatorInfoModal from '~/components/students/StudentOperatorInfoModal.vue'
import NoAdeudoModal from '~/components/NoAdeudoModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const route = useRoute()
useHead({ bodyAttrs: { class: 'students-route-active' } })
const { studentsSyncState, readCachedStudents, writeCachedStudents, setStudentsSyncState } = useStudentsCacheSync()
const { accountStateSyncState } = useAccountStateCacheSync()
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')
const activePlantelCookie = useCookie('auth_active_plantel')
const roleTokens = computed(() => String(userRole.value || '').split(',').map(role => role.trim().toLowerCase()).filter(Boolean))
const isSuperAdminRole = computed(() => roleTokens.value.some(role => ['superadmin'].includes(role)))
const hasFinancialAccessCookie = useCookie('auth_has_financial_access')
const isControlEscolarOnly = computed(() => !isSuperAdminRole.value && hasFinancialAccessCookie.value !== 'true')
const canOpenStudentOperatorInfo = computed(() => !isControlEscolarOnly.value)

const filters = ref({ q: '' })
const activeFilter = ref('inscritos')
const activeGrado = ref('')
const activeGrupo = ref('')
const activeSaldoFilter = ref('all')

const externalConcepts = ref([])
const tipoIngresoConcepts = ref([])
const ENROLLMENT_CONCEPTS_CACHE_BASE_KEY = 'students-enrollment-concepts:v3'
const currentCicloKey = computed(() => normalizeCicloKey(state.value.ciclo))
const currentPlantelKey = computed(() => normalizeEnrollmentPlantelKey(activePlantelCookie.value || 'GLOBAL') || 'GLOBAL')
const enrollmentConceptsCacheKey = computed(() => `${ENROLLMENT_CONCEPTS_CACHE_BASE_KEY}:${currentCicloKey.value}:${currentPlantelKey.value}`)

const students = ref([])
const loading = ref(false)
const studentsSourceUnavailable = computed(() => studentsSyncState.value.status === 'unavailable' && !students.value.length && !loading.value)
const financialEnrichmentState = ref({
  status: 'idle',
  message: 'Enriquecimiento pendiente.',
  requested: 0,
  found: 0,
  error: null,
  lastUpdatedAt: null
})
const financialEnrichmentDiagnostics = computed(() => {
  const total = students.value.length
  const enriched = students.value.filter(student => Boolean(student?.centralMatricula) || student?.matriculaEnrichmentStatus === 'ready').length
  return { total, enriched, pending: Math.max(total - enriched, 0) }
})
const lastFinancialLoadDiagnostics = ref(null)

const financialNow = () => (typeof performance !== 'undefined' && performance?.now ? performance.now() : Date.now())
const cloneFinancialDiagnostics = (payload) => {
  try {
    return JSON.parse(JSON.stringify(payload))
  } catch {
    return payload ? { ...payload } : null
  }
}
const formatFinancialDuration = (ms) => {
  const value = Number(ms || 0)
  if (!Number.isFinite(value)) return '0 ms'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`
}
const financialStatusTone = (status = '') => {
  const normalized = String(status || '').toLowerCase()
  if (['ready', 'updated', 'cached', 'complete'].includes(normalized)) return 'success'
  if (['partial', 'syncing', 'loading'].includes(normalized)) return 'info'
  if (['skipped', 'disabled', 'idle', 'empty', 'missing'].includes(normalized)) return 'muted'
  if (['failed', 'unavailable', 'error'].includes(normalized)) return 'danger'
  return 'neutral'
}
const financialStatusLabel = (status = '') => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'ready') return 'Listo'
  if (normalized === 'updated') return 'Actualizado'
  if (normalized === 'cached') return 'En caché'
  if (normalized === 'syncing') return 'Sincronizando'
  if (normalized === 'partial') return 'Parcial'
  if (normalized === 'failed') return 'Falló'
  if (normalized === 'unavailable') return 'No disponible'
  if (normalized === 'disabled') return 'Desactivado'
  if (normalized === 'skipped') return 'Omitido'
  if (normalized === 'empty') return 'Vacío'
  if (normalized === 'missing') return 'Sin coincidencias'
  if (normalized === 'idle') return 'En espera'
  return normalized || 'Sin estado'
}
const publishFinancialDiagnostics = (trace) => {
  lastFinancialLoadDiagnostics.value = cloneFinancialDiagnostics(trace)
}
const upsertFinancialTraceStep = (trace, lane, step) => {
  if (!trace) return
  const target = lane === 'server' ? trace.serverSteps : trace.clientSteps
  const normalizedStep = {
    tone: financialStatusTone(step.status),
    statusLabel: financialStatusLabel(step.status),
    ...step,
  }
  const index = target.findIndex((candidate) => candidate.key === normalizedStep.key)
  if (index >= 0) target.splice(index, 1, normalizedStep)
  else target.push(normalizedStep)
  publishFinancialDiagnostics(trace)
}
const createFinancialDiagnosticsTrace = ({ requestId, useCache, cicloKey, query, hadStudents }) => ({
  requestId,
  capturedAt: new Date().toISOString(),
  status: 'syncing',
  statusLabel: financialStatusLabel('syncing'),
  totalMs: 0,
  query: query || '',
  ciclo: cicloKey,
  options: {
    useCache: Boolean(useCache),
    hadStudents: Boolean(hadStudents),
  },
  source: {
    base: '',
    browserCache: {
      used: false,
      available: false,
      rows: 0,
      savedAt: '',
      reason: '',
    },
    server: {
      bridgeState: 'unknown',
      flow: '',
      baseRows: 0,
      sectionsRows: 0,
      overlayRequested: 0,
      overlayFound: 0,
      overlayStatus: 'idle',
      overlayReason: '',
      overlayError: '',
      cacheRefresh: '',
      scopedPlantel: '',
      queryMode: query ? 'search' : 'scope',
      enrollmentConcepts: 0,
    },
  },
  resolution: {
    finalRows: 0,
    cacheWritten: false,
    visibleOverlayStatus: 'idle',
    visibleOverlayFound: 0,
    visibleOverlayRequested: 0,
  },
  clientSteps: [],
  serverSteps: [],
})
const readFinancialDiagnosticsHeaders = (response) => ({
  bridgeState: response?.headers?.get('x-financial-students-bridge-state') || 'unknown',
  flow: response?.headers?.get('x-financial-students-flow') || '',
  baseRows: Number(response?.headers?.get('x-financial-students-base-rows') || 0),
  sectionsRows: Number(response?.headers?.get('x-financial-students-sections-rows') || 0),
  overlayRequested: Number(response?.headers?.get('x-financial-students-overlay-requested') || 0),
  overlayFound: Number(response?.headers?.get('x-financial-students-overlay-found') || 0),
  overlayStatus: response?.headers?.get('x-financial-students-overlay-status') || 'idle',
  overlayReason: response?.headers?.get('x-financial-students-overlay-reason') || '',
  overlayError: response?.headers?.get('x-financial-students-overlay-error') || '',
  cacheRefresh: response?.headers?.get('x-financial-students-cache-refresh') || '',
  scopedPlantel: response?.headers?.get('x-financial-students-scoped-plantel') || '',
  queryMode: response?.headers?.get('x-financial-students-query-mode') || 'scope',
  enrollmentConcepts: Number(response?.headers?.get('x-financial-students-enrollment-concepts') || 0),
})
const financialDiagnosticsTree = computed(() => {
  const diagnostics = lastFinancialLoadDiagnostics.value
  if (!diagnostics) return []
  const makeNode = (step, lane) => ({
    id: `${lane}-${step.key}`,
    lane,
    laneLabel: lane === 'server' ? 'Servidor' : 'Cliente',
    title: step.label,
    decision: step.decision || step.label,
    why: step.why || 'Sin detalle adicional.',
    tone: step.tone || financialStatusTone(step.status),
    status: step.status,
    statusLabel: step.statusLabel || financialStatusLabel(step.status),
    ms: Number(step.ms || 0),
    meta: Array.isArray(step.meta) ? step.meta.filter(item => item && item.value !== '' && item.value != null) : [],
  })

  const nodes = [
    ...diagnostics.clientSteps.map((step) => makeNode(step, 'client')),
    ...diagnostics.serverSteps.map((step) => makeNode(step, 'server')),
  ]

  nodes.push({
    id: 'result-final',
    lane: 'result',
    laneLabel: 'Resultado',
    title: 'Resultado final visible',
    decision: diagnostics.status === 'failed'
      ? 'La ruta no terminó limpia y se conservó lo disponible.'
      : 'La ruta terminó y dejó una base visible para trabajar.',
    why: diagnostics.status === 'failed'
      ? 'El flujo terminó con error o degradación; el modal refleja el último punto conocido del recorrido.'
      : 'El modal resume la última resolución completa, incluyendo caché, bridge y enriquecimientos.',
    tone: financialStatusTone(diagnostics.status),
    status: diagnostics.status,
    statusLabel: financialStatusLabel(diagnostics.status),
    ms: diagnostics.totalMs,
    meta: [
      { label: 'Filas visibles', value: diagnostics.resolution?.finalRows ?? 0 },
      { label: 'Overlay visible', value: `${diagnostics.resolution?.visibleOverlayFound ?? 0}/${diagnostics.resolution?.visibleOverlayRequested ?? 0}` },
      { label: 'Caché escrita', value: diagnostics.resolution?.cacheWritten ? 'Sí' : 'No' },
    ],
  })

  return nodes
})
const financialDiagnosticsSummary = computed(() => {
  const diagnostics = lastFinancialLoadDiagnostics.value
  if (!diagnostics) return []
  return [
    { label: 'Estado final', value: financialStatusLabel(diagnostics.status), tone: financialStatusTone(diagnostics.status) },
    { label: 'Tiempo cliente', value: formatFinancialDuration(diagnostics.totalMs), tone: 'neutral' },
    { label: 'Bridge', value: diagnostics.source?.server?.bridgeState || 'unknown', tone: financialStatusTone(diagnostics.source?.server?.bridgeState === 'ready' ? 'ready' : diagnostics.status) },
    { label: 'Base / overlay', value: `${diagnostics.source?.server?.baseRows || 0} / ${diagnostics.source?.server?.overlayFound || 0}`, tone: 'neutral' },
  ]
})
const selectedStudent = ref(null)
const photoCache = ref({})
const globalKpis = ref({ ingresosMes: 0 })
const paymentKpiSparklines = ref({ inscritos: [], internos: [], externos: [], ingresos: [] })
const isKpiRefreshing = ref(false)
const KPI_REFRESH_MIN_VISIBLE_MS = 1400
let kpiRefreshStartedAt = 0
let kpiRefreshTimer = null
const showStudentModal = ref(false)
const editingStudent = ref(null)
const pendingBajaStudent = ref(null)
const pendingBulkBajaStudents = ref([])
const bulkBajaSaving = ref(false)
const operatorInfoStudent = ref(null)
const noAdeudoStudents = ref([])
const showFinancialDiagnosticsModal = ref(false)
const bulkWorkspaceMode = ref('none')
const showBulkIngresoCycleModal = ref(false)
const bulkIngresoSaving = ref(false)
const bulkIngresoResult = ref(null)
const format = formatMoney
const {
  selectedMatriculas,
  selectedStudentKeys,
  selectedCount,
  selectedStudents,
  selectedBalanceTotal,
  selectionPrimaryStudent,
  displayedMatriculas,
  allDisplayedSelected,
  someDisplayedSelected,
  setSelectedMatriculas,
  clearSelectedStudents: clearStudentSelection,
  isStudentSelected,
  toggleStudentSelection,
  toggleDisplayedSelection
} = useStudentSelection(students, computed(() => displayedStudents.value))

const {
  bulkPaymentMethod,
  bulkPaymentLoading,
  bulkPaymentProcessing,
  bulkPaymentRows,
  bulkPaymentDebtCount,
  bulkPaymentTotal,
  bulkPaymentStudentCount,
  resetBulkPayments,
  loadBulkPaymentDebts,
  submitBulkPayments
} = useStudentBulkPayments({
  selectedStudents,
  state,
  notify: show,
  refreshStudents: () => refreshAfterStudentMutation(),
  clearSelection: () => {
    clearStudentSelection()
    bulkWorkspaceMode.value = 'none'
  }
})

const {
  customSections,
  customSectionCounts,
  showSectionModal,
  sectionModalStudent,
  sectionModalStudents,
  newSectionName,
  creatingSection,
  assigningSections,
  loadCustomSections,
  openSectionModal,
  openSectionModalForSelection,
  closeSectionModal,
  createCustomSection,
  toggleStudentSection,
  bulkSectionState,
  toggleBulkSection,
  deleteCustomSection
} = useStudentSections({
  students,
  selectedStudent,
  selectedMatriculas,
  selectedCount,
  activeFilter
})
const selectedAverageBalance = computed(() => selectedCount.value ? selectedBalanceTotal.value / selectedCount.value : 0)
const selectedGradeSummary = computed(() => {
  const grades = new Set(selectedStudents.value.map(student => gradeVisualTitle(student)).filter(Boolean))
  if (!grades.size) return 'Sin grados'
  const values = Array.from(grades)
  return values.length > 3 ? `${values.slice(0, 3).join(', ')} +${values.length - 3}` : values.join(', ')
})
const selectedGroupSummary = computed(() => {
  const groups = new Set(selectedStudents.value.map(studentGroupLabel).filter(Boolean))
  if (!groups.size) return ''
  const values = Array.from(groups)
  return values.length > 3 ? `Grupos ${values.slice(0, 3).join(', ')} +${values.length - 3}` : `Grupos ${values.join(', ')}`
})
const selectedSectionSummary = computed(() => {
  const names = new Set()
  selectedStudents.value.forEach(student => (student.customSections || []).forEach(section => section?.name && names.add(section.name)))
  if (!names.size) return 'Sin sección'
  const values = Array.from(names)
  return values.length > 2 ? `${values.slice(0, 2).join(', ')} +${values.length - 2}` : values.join(', ')
})
const hasAccountWorkspace = computed(() => Boolean(selectedStudent.value) || (selectedCount.value > 1 && bulkWorkspaceMode.value !== 'none'))
const studentsWorkspaceEl = ref(null)
const workspaceSplitPercent = ref(51)
const workspaceStackPercent = ref(46)
const workspaceIsStacked = ref(false)
const workspaceResizing = ref(false)
const WORKSPACE_SPLIT_STORAGE_KEY = 'students:workspace-split-percent:v1'
const WORKSPACE_STACK_STORAGE_KEY = 'students:workspace-stack-percent:v1'
const WORKSPACE_SPLIT_DEFAULT = 51
const WORKSPACE_STACK_DEFAULT = 46
const WORKSPACE_SPLIT_MIN = 24
const WORKSPACE_SPLIT_MAX = 76
const WORKSPACE_STACK_MIN = 28
const WORKSPACE_STACK_MAX = 68
const WORKSPACE_STACK_THRESHOLD = 760
const clampWorkspaceSplit = (value) => Math.min(WORKSPACE_SPLIT_MAX, Math.max(WORKSPACE_SPLIT_MIN, Number(value) || WORKSPACE_SPLIT_DEFAULT))
const clampWorkspaceStack = (value) => Math.min(WORKSPACE_STACK_MAX, Math.max(WORKSPACE_STACK_MIN, Number(value) || WORKSPACE_STACK_DEFAULT))
const clampWorkspacePointerPercent = (nextValue, minPercent, maxPercent, fallback) => {
  if (!Number.isFinite(minPercent) || !Number.isFinite(maxPercent)) return fallback
  if (minPercent > maxPercent) return Math.min(100, Math.max(0, (minPercent + maxPercent) / 2))
  return Math.min(maxPercent, Math.max(minPercent, nextValue))
}
const studentsWorkspaceStyle = computed(() => ({
  '--students-list-panel-size': `${workspaceSplitPercent.value}%`,
  '--students-detail-panel-size': `${100 - workspaceSplitPercent.value}%`,
  '--students-list-stack-size': `${workspaceStackPercent.value}%`,
  '--students-detail-stack-size': `${100 - workspaceStackPercent.value}%`
}))
const workspaceResizerOrientation = computed(() => workspaceIsStacked.value ? 'horizontal' : 'vertical')
const workspaceResizerValue = computed(() => workspaceIsStacked.value ? workspaceStackPercent.value : workspaceSplitPercent.value)
const workspaceResizerMin = computed(() => workspaceIsStacked.value ? WORKSPACE_STACK_MIN : WORKSPACE_SPLIT_MIN)
const workspaceResizerMax = computed(() => workspaceIsStacked.value ? WORKSPACE_STACK_MAX : WORKSPACE_SPLIT_MAX)
const workspaceResizerLabel = computed(() => workspaceIsStacked.value
  ? 'Redimensionar lista de alumnos y panel de trabajo'
  : 'Redimensionar lista de alumnos y estado de cuenta')
const workspaceResizerTitle = computed(() => workspaceIsStacked.value
  ? 'Arrastra para ajustar la altura entre lista y panel. Doble clic para restaurar.'
  : 'Arrastra para ajustar el ancho entre lista y panel. Doble clic para restaurar.')
const workspaceResizerText = computed(() => workspaceIsStacked.value
  ? `Lista ${Math.round(workspaceStackPercent.value)}%, panel ${Math.round(100 - workspaceStackPercent.value)}%`
  : `Lista ${Math.round(workspaceSplitPercent.value)}%, panel ${Math.round(100 - workspaceSplitPercent.value)}%`)
const persistWorkspaceSplit = () => {
  if (!process.client) return
  localStorage.setItem(WORKSPACE_SPLIT_STORAGE_KEY, String(Math.round(workspaceSplitPercent.value * 10) / 10))
  localStorage.setItem(WORKSPACE_STACK_STORAGE_KEY, String(Math.round(workspaceStackPercent.value * 10) / 10))
}
const setWorkspaceSplitFromPointer = (clientX, clientY) => {
  const workspace = studentsWorkspaceEl.value
  if (!workspace) return
  const rect = workspace.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  if (workspaceIsStacked.value) {
    const minListPx = Math.min(420, Math.max(220, rect.height * 0.28))
    const minDetailPx = Math.min(560, Math.max(300, rect.height * 0.34))
    const minPercent = Math.max(WORKSPACE_STACK_MIN, (minListPx / rect.height) * 100)
    const maxPercent = Math.min(WORKSPACE_STACK_MAX, 100 - (minDetailPx / rect.height) * 100)
    const nextSplit = ((clientY - rect.top) / rect.height) * 100
    workspaceStackPercent.value = clampWorkspacePointerPercent(nextSplit, minPercent, maxPercent, workspaceStackPercent.value)
    return
  }

  const minListPx = Math.min(560, Math.max(300, rect.width * 0.26))
  const minDetailPx = Math.min(620, Math.max(340, rect.width * 0.3))
  const minPercent = Math.max(WORKSPACE_SPLIT_MIN, (minListPx / rect.width) * 100)
  const maxPercent = Math.min(WORKSPACE_SPLIT_MAX, 100 - (minDetailPx / rect.width) * 100)
  const nextSplit = ((clientX - rect.left) / rect.width) * 100
  workspaceSplitPercent.value = clampWorkspacePointerPercent(nextSplit, minPercent, maxPercent, workspaceSplitPercent.value)
}
let workspaceResizePointerId = null
let workspaceResizeFrame = null
let workspaceResizeObserver = null
let workspacePendingPointer = null
const updateWorkspaceOrientation = () => {
  const workspace = studentsWorkspaceEl.value
  const rect = workspace?.getBoundingClientRect?.()
  workspaceIsStacked.value = Boolean(rect?.width && rect.width <= WORKSPACE_STACK_THRESHOLD)
}
const scheduleWorkspaceOrientationUpdate = () => nextTick(() => {
  if (!process.client) return
  window.requestAnimationFrame(updateWorkspaceOrientation)
})
const stopWorkspaceResize = () => {
  if (!workspaceResizing.value) return
  workspaceResizing.value = false
  workspaceResizePointerId = null
  workspacePendingPointer = null
  if (process.client && workspaceResizeFrame) {
    window.cancelAnimationFrame(workspaceResizeFrame)
    workspaceResizeFrame = null
  }
  persistWorkspaceSplit()
  if (process.client) {
    document.body.classList.remove('students-workspace-resizing')
    document.body.classList.remove('students-workspace-resizing-stacked')
    window.removeEventListener('pointermove', onWorkspaceResizeMove)
    window.removeEventListener('pointerup', stopWorkspaceResize)
    window.removeEventListener('pointercancel', stopWorkspaceResize)
  }
}
const onWorkspaceResizeMove = (event) => {
  if (!workspaceResizing.value) return
  if (workspaceResizePointerId !== null && event.pointerId !== workspaceResizePointerId) return
  workspacePendingPointer = { clientX: event.clientX, clientY: event.clientY }
  if (workspaceResizeFrame || !process.client) return
  workspaceResizeFrame = window.requestAnimationFrame(() => {
    workspaceResizeFrame = null
    if (!workspacePendingPointer) return
    setWorkspaceSplitFromPointer(workspacePendingPointer.clientX, workspacePendingPointer.clientY)
  })
}
const startWorkspaceResize = (event) => {
  if (!process.client || !hasAccountWorkspace.value) return
  updateWorkspaceOrientation()
  workspaceResizePointerId = event.pointerId ?? null
  workspaceResizing.value = true
  document.body.classList.add('students-workspace-resizing')
  document.body.classList.toggle('students-workspace-resizing-stacked', workspaceIsStacked.value)
  setWorkspaceSplitFromPointer(event.clientX, event.clientY)
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onWorkspaceResizeMove)
  window.addEventListener('pointerup', stopWorkspaceResize)
  window.addEventListener('pointercancel', stopWorkspaceResize)
}
const resetWorkspaceSplit = () => {
  workspaceSplitPercent.value = WORKSPACE_SPLIT_DEFAULT
  workspaceStackPercent.value = WORKSPACE_STACK_DEFAULT
  persistWorkspaceSplit()
}
const nudgeWorkspaceSplit = (amount) => {
  if (workspaceIsStacked.value) return
  workspaceSplitPercent.value = clampWorkspaceSplit(workspaceSplitPercent.value + amount)
  persistWorkspaceSplit()
}
const nudgeWorkspaceStack = (amount) => {
  if (!workspaceIsStacked.value) return
  workspaceStackPercent.value = clampWorkspaceStack(workspaceStackPercent.value + amount)
  persistWorkspaceSplit()
}
const accountWorkspaceMode = computed(() => {
  if (selectedCount.value > 1 && bulkWorkspaceMode.value === 'bulk-payment') return 'bulk-payment'
  if (selectedCount.value > 1 && bulkWorkspaceMode.value === 'bulk') return 'bulk'
  if (selectedStudent.value) return 'detail'
  return 'none'
})
const readCachedStudentPhotos = () => {
  if (!process.client) return
  const next = {}
  students.value.forEach((student) => {
    const matricula = normalizeStudentMatricula(student.matricula)
    const cached = sessionStorage.getItem(photoStorageKey(matricula))
    if (cached && cached !== 'none') next[matricula] = cached
  })
  photoCache.value = next
}

const cacheStudentPhoto = ({ matricula, photoUrl }) => {
  const normalized = normalizeStudentMatricula(matricula)
  if (!normalized) return
  if (photoUrl && photoUrl !== 'none') {
    photoCache.value = { ...photoCache.value, [normalized]: photoUrl }
    if (process.client) sessionStorage.setItem(photoStorageKey(normalized), photoUrl)
  }
}

const clearKpiRefreshTimer = () => {
  if (!kpiRefreshTimer) return
  clearTimeout(kpiRefreshTimer)
  kpiRefreshTimer = null
}

const startKpiRefresh = () => {
  clearKpiRefreshTimer()
  kpiRefreshStartedAt = Date.now()
  if (!isKpiRefreshing.value) {
    isKpiRefreshing.value = true
  }
}

const stopKpiRefresh = () => {
  if (!isKpiRefreshing.value) return

  clearKpiRefreshTimer()
  const elapsed = Date.now() - kpiRefreshStartedAt
  const remaining = Math.max(KPI_REFRESH_MIN_VISIBLE_MS - elapsed, 0)

  kpiRefreshTimer = setTimeout(() => {
    isKpiRefreshing.value = false
    kpiRefreshTimer = null
  }, remaining)
}

let kpiRefreshScopeId = 0
const activeKpiRefreshScopes = new Set()

const beginKpiRefreshScope = () => {
  const token = ++kpiRefreshScopeId
  activeKpiRefreshScopes.add(token)
  startKpiRefresh()
  return token
}

const endKpiRefreshScope = (token) => {
  if (!token) return
  activeKpiRefreshScopes.delete(token)
  if (!activeKpiRefreshScopes.size) stopKpiRefresh()
}


const gradeNumberForSparkline = (student) => {
  const value = String(student?.grado || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const direct = value.match(/\d+/)?.[0]
  if (direct) return Number(direct)
  if (value.includes('prim')) return 1
  if (value.includes('seg')) return 2
  if (value.includes('ter')) return 3
  if (value.includes('cuar')) return 4
  if (value.includes('quin')) return 5
  if (value.includes('sext')) return 6
  return 0
}

const distributionSeries = (list) => {
  const buckets = [0, 0, 0, 0, 0, 0]
  list.forEach((student) => {
    const grade = gradeNumberForSparkline(student)
    const index = grade >= 1 && grade <= 6 ? grade - 1 : 5
    buckets[index] += 1
  })
  return buckets.some(Boolean) ? buckets : []
}

const kpiSparklines = computed(() => ({
  inscritos: paymentKpiSparklines.value.inscritos || [],
  internos: paymentKpiSparklines.value.internos || [],
  externos: paymentKpiSparklines.value.externos || [],
  ingresos: paymentKpiSparklines.value.ingresos || [],
  no_inscritos: distributionSeries(students.value.filter(isNoInscritoForSelectedCiclo)),
  bajas: distributionSeries(students.value.filter(isBajaInscritaCurrent))
}))

let kpiSparklineRequestId = 0
const loadKpiSparklines = async () => {
  const requestId = ++kpiSparklineRequestId
  let refreshToken = null
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    if (!externalConcepts.value.length) {
      paymentKpiSparklines.value = { inscritos: [], internos: [], externos: [], ingresos: [] }
      return
    }

    refreshToken = beginKpiRefreshScope()
    const res = await $fetch('/api/students/kpi-trends', {
      params: {
        ciclo: cicloKey,
        concepts: externalConcepts.value.join(','),
        tipoConcepts: tipoIngresoConcepts.value.join(',')
      }
    })
    if (requestId !== kpiSparklineRequestId) return
    paymentKpiSparklines.value = {
      inscritos: Array.isArray(res?.inscritos) ? res.inscritos : [],
      internos: Array.isArray(res?.internos) ? res.internos : [],
      externos: Array.isArray(res?.externos) ? res.externos : [],
      ingresos: Array.isArray(res?.ingresos) ? res.ingresos : []
    }
  } catch (e) {
    if (requestId === kpiSparklineRequestId) paymentKpiSparklines.value = { inscritos: [], internos: [], externos: [], ingresos: [] }
  } finally {
    endKpiRefreshScope(refreshToken)
  }
}

const hasActiveFilters = computed(() => Boolean(
  (activeFilter.value && activeFilter.value !== 'inscritos') ||
  activeGrado.value ||
  activeGrupo.value ||
  activeSaldoFilter.value !== 'all' ||
  filters.value.q
))

const activeFilterLabel = computed(() => {
  if (isSectionFilter(activeFilter.value)) {
    const sectionId = sectionIdFromFilter(activeFilter.value)
    return customSections.value.find(section => Number(section.id) === sectionId)?.name || 'Seccion personalizada'
  }

  return ({
    inscritos: 'Inscritos',
    internos: 'Internos',
    externos: 'Externos',
    no_inscritos: 'No inscritos',
    bajas: 'Bajas'
  }[activeFilter.value] || 'Todos los estados')
})

const activeInlineFilterLabel = computed(() => {
  if (!activeFilter.value || activeFilter.value === 'inscritos') return ''
  return activeFilterLabel.value
})

const DEFAULT_KPI_FILTER = 'inscritos'
const CORE_KPI_FILTERS = new Set(['inscritos', 'internos', 'externos', 'no_inscritos', 'bajas'])

const isKnownDashboardFilter = (filter) => {
  const raw = String(filter || '').trim()
  if (CORE_KPI_FILTERS.has(raw)) return true
  if (!isSectionFilter(raw)) return false
  const sectionId = sectionIdFromFilter(raw)
  return customSections.value.some(section => Number(section.id) === sectionId)
}

const normalizeDashboardFilter = (filter) => {
  const raw = String(filter || DEFAULT_KPI_FILTER).trim()
  return isKnownDashboardFilter(raw) ? raw : DEFAULT_KPI_FILTER
}

const setActiveFilter = (filter) => {
  const nextFilter = normalizeDashboardFilter(filter)
  activeFilter.value = activeFilter.value === nextFilter && nextFilter !== DEFAULT_KPI_FILTER
    ? DEFAULT_KPI_FILTER
    : nextFilter
  activeGrado.value = ''
  activeGrupo.value = ''
}

const toggleSaldoDebtFilter = () => {
  activeSaldoFilter.value = activeSaldoFilter.value === 'debt' ? 'all' : 'debt'
}

const clearActiveFilter = () => {
  activeFilter.value = DEFAULT_KPI_FILTER
}

const clearFilters = () => {
  filters.value.q = ''
  activeFilter.value = DEFAULT_KPI_FILTER
  activeGrado.value = ''
  activeGrupo.value = ''
  activeSaldoFilter.value = 'all'
  performSearch()
}


const cacheEnrollmentConcepts = ({ current = [], tipoIngreso = [] } = {}) => {
  const currentConceptIds = normalizeEnrollmentConceptIds(current)
  const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(tipoIngreso)
  if (!process.client || (!currentConceptIds.length && !tipoIngresoConceptIds.length)) return
  try {
    localStorage.setItem(enrollmentConceptsCacheKey.value, JSON.stringify({
      savedAt: new Date().toISOString(),
      currentConcepts: currentConceptIds,
      tipoIngresoConcepts: tipoIngresoConceptIds
    }))
  } catch (error) {
    console.warn('[Enrollment concepts cache] Could not persist enrollment concepts.', error)
  }
}

const hydrateCachedEnrollmentConcepts = () => {
  if (!process.client || externalConcepts.value.length) return
  try {
    const parsed = JSON.parse(localStorage.getItem(enrollmentConceptsCacheKey.value) || 'null')
    const currentConceptIds = normalizeEnrollmentConceptIds(parsed?.currentConcepts || parsed?.concepts)
    const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(parsed?.tipoIngresoConcepts || currentConceptIds)
    if (currentConceptIds.length) externalConcepts.value = currentConceptIds
    if (tipoIngresoConceptIds.length) tipoIngresoConcepts.value = tipoIngresoConceptIds
  } catch (error) {
    console.warn('[Enrollment concepts cache] Could not read enrollment concepts.', error)
  }
}

const parseEnrollmentConfig = (obj) => {
  const currentConceptIds = parseEnrollmentConceptsForScope(obj, { ciclo: currentCicloKey.value, plantel: currentPlantelKey.value })
  const tipoIngresoConceptIds = parseEnrollmentConceptsForPlantelHistory(obj, { plantel: currentPlantelKey.value })
  if (!currentConceptIds.length) {
    console.warn('[Enrollment concepts] Remote config did not include current-cycle concept ids for this plantel; preserving the current local concepts.')
    return
  }

  externalConcepts.value = currentConceptIds
  tipoIngresoConcepts.value = tipoIngresoConceptIds.length ? tipoIngresoConceptIds : currentConceptIds
  cacheEnrollmentConcepts({ current: externalConcepts.value, tipoIngreso: tipoIngresoConcepts.value })
}

const loadGlobalKpis = async () => {
  const refreshToken = beginKpiRefreshScope()
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch('/api/dashboard/kpis', { params: { ciclo: cicloKey, concepts: externalConcepts.value.join(','), tipoConcepts: tipoIngresoConcepts.value.join(',') } })
    globalKpis.value.ingresosMes = res.ingresosMes || 0
  } catch(e) {
  } finally {
    endKpiRefreshScope(refreshToken)
  }
}

let studentsRequestId = 0

let matriculaOverlayRequestId = 0

const compactText = (value) => String(value || '').trim()

const extractMatriculaOverlayStudent = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload.student && typeof payload.student === 'object'
    ? payload.student
    : payload.centralMatricula?.student && typeof payload.centralMatricula.student === 'object'
      ? payload.centralMatricula.student
      : payload
  const hasUsefulData = [
    candidate.matricula, candidate.curp, candidate.padre, candidate.madre,
    candidate.nombrePadre, candidate.nombreMadre, candidate.emailPadre, candidate.emailMadre,
    candidate.telefonoPadre, candidate.telefonoMadre
  ].some((value) => compactText(value))
  return hasUsefulData ? candidate : null
}

const applyMatriculaOverlayFields = (student, overlayPayload) => {
  if (!student) return student
  const overlayStudent = extractMatriculaOverlayStudent(overlayPayload)
  if (!overlayStudent) return student
  const central = { ...(extractMatriculaOverlayStudent(student.centralMatricula) || {}), ...overlayStudent }
  const merged = {
    ...student,
    centralMatricula: central,
    centralMatriculaRaw: overlayPayload?.raw || overlayPayload?.centralMatriculaRaw || student.centralMatriculaRaw || null,
    matriculaEnrichmentStatus: 'ready',
    curp: compactText(central.curp) || student.curp,
    madre: compactText(central.madre) || student.madre,
    telefonoPadre: compactText(central.telefonoPadre) || student.telefonoPadre,
    telefonoMadre: compactText(central.telefonoMadre) || student.telefonoMadre,
    emailPadre: compactText(central.emailPadre) || student.emailPadre,
    emailMadre: compactText(central.emailMadre) || student.emailMadre,
    nombrePadre: compactText(central.nombrePadre) || student.nombrePadre,
    apellidoPaternoPadre: compactText(central.apellidoPaternoPadre) || student.apellidoPaternoPadre,
    apellidoMaternoPadre: compactText(central.apellidoMaternoPadre) || student.apellidoMaternoPadre,
    nombrePadreCompleto: compactText(central.nombrePadreCompleto) || student.nombrePadreCompleto,
    ocupacionPadre: compactText(central.ocupacionPadre) || student.ocupacionPadre,
    nombreMadre: compactText(central.nombreMadre) || student.nombreMadre,
    apellidoPaternoMadre: compactText(central.apellidoPaternoMadre) || student.apellidoPaternoMadre,
    apellidoMaternoMadre: compactText(central.apellidoMaternoMadre) || student.apellidoMaternoMadre,
    nombreMadreCompleto: compactText(central.nombreMadreCompleto) || student.nombreMadreCompleto,
    ocupacionMadre: compactText(central.ocupacionMadre) || student.ocupacionMadre,
    direccion: compactText(central.direccion) || student.direccion,
  }
  const familyContact = resolveFinancialFamilyContact(merged)
  return {
    ...merged,
    padre: familyContact.tutorName || student.padre,
    tutor: familyContact.tutorName || student.tutor,
    telefono: familyContact.phone || student.telefono,
    correo: familyContact.email || student.correo,
    controlEscolarFamilyContact: familyContact,
  }
}

const withControlEscolarProgress = (student) => {
  if (!student) return student
  const normalized = applyMatriculaOverlayFields(student, student.centralMatricula)
  const progress = resolveControlEscolarProgress({
    ...normalized,
    ...(extractMatriculaOverlayStudent(normalized.centralMatricula) || {})
  })
  return {
    ...normalized,
    controlEscolarProgress: progress.progress,
    controlEscolarMissingFields: progress.missingFields,
    controlEscolarProgressSummary: progress.summary,
    controlEscolarProgressComplete: progress.complete
  }
}

const mergeMatriculaOverlayIntoStudent = (student, overlayPayload) => {
  return withControlEscolarProgress(applyMatriculaOverlayFields(student, overlayPayload))
}

const loadVisibleMatriculaOverlays = async (cacheOptions = null, traceContext = null) => {
  const matriculas = Array.from(new Set(students.value
    .map((student) => normalizeStudentMatricula(student.matricula))
    .filter(Boolean)))

  const overlayStartedAt = financialNow()

  if (!matriculas.length) {
    financialEnrichmentState.value = {
      status: 'idle',
      message: 'Sin matrículas visibles para enriquecer.',
      requested: 0,
      found: 0,
      error: null,
      lastUpdatedAt: null
    }
    if (traceContext) {
      traceContext.resolution.visibleOverlayStatus = 'skipped'
      traceContext.resolution.visibleOverlayFound = 0
      traceContext.resolution.visibleOverlayRequested = 0
      upsertFinancialTraceStep(traceContext, 'client', {
        key: 'client-visible-overlay',
        label: 'Revisión visible de matrícula central',
        status: 'skipped',
        ms: financialNow() - overlayStartedAt,
        decision: 'No se reconsultó overlay visible.',
        why: 'No había matrículas visibles en pantalla para volver a contrastar.',
        meta: [{ label: 'Motivo', value: 'Sin matrículas visibles' }],
      })
    }
    return
  }

  const requestId = ++matriculaOverlayRequestId
  financialEnrichmentState.value = {
    status: 'syncing',
    message: 'Consultando matrícula central como enriquecimiento opcional.',
    requested: matriculas.length,
    found: financialEnrichmentDiagnostics.value.enriched,
    error: null,
    lastUpdatedAt: financialEnrichmentState.value.lastUpdatedAt
  }
  if (traceContext) {
    upsertFinancialTraceStep(traceContext, 'client', {
      key: 'client-visible-overlay',
      label: 'Revisión visible de matrícula central',
      status: 'syncing',
      ms: financialNow() - overlayStartedAt,
      decision: 'Se abrió una verificación visible adicional.',
      why: 'Después de pintar la base financiera, el cliente vuelve a revisar matrícula central para que el detalle visible no se quede atrás.',
      meta: [{ label: 'Matrículas visibles', value: matriculas.length }],
    })
  }

  try {
    const response = await $fetch('/api/students/matricula-overlays', {
      method: 'POST',
      body: { matriculas }
    })
    if (requestId !== matriculaOverlayRequestId) return

    if (!response?.ok) {
      financialEnrichmentState.value = {
        status: 'failed',
        message: response?.message || 'No se pudo consultar matrícula central.',
        requested: Number(response?.requested || matriculas.length),
        found: Number(response?.found || 0),
        error: response?.message || 'matricula-enrichment-failed',
        lastUpdatedAt: new Date().toISOString()
      }
      if (traceContext) {
        traceContext.resolution.visibleOverlayStatus = 'failed'
        traceContext.resolution.visibleOverlayFound = Number(response?.found || 0)
        traceContext.resolution.visibleOverlayRequested = Number(response?.requested || matriculas.length)
        upsertFinancialTraceStep(traceContext, 'client', {
          key: 'client-visible-overlay',
          label: 'Revisión visible de matrícula central',
          status: 'failed',
          ms: financialNow() - overlayStartedAt,
          decision: 'La revalidación visible no pudo completar el contraste.',
          why: response?.message || 'La API de matrícula central respondió sin confirmar la revisión visible.',
          meta: [
            { label: 'Solicitados', value: Number(response?.requested || matriculas.length) },
            { label: 'Encontrados', value: Number(response?.found || 0) },
          ],
        })
      }
      return
    }

    const overlays = new Map()
    for (const overlay of response.overlays || []) {
      const overlayStudent = extractMatriculaOverlayStudent(overlay)
      const key = normalizeStudentMatricula(overlayStudent?.matricula)
      if (key) overlays.set(key, overlayStudent)
    }

    students.value = students.value.map((student) => {
      const key = normalizeStudentMatricula(student.matricula)
      return overlays.has(key)
        ? mergeMatriculaOverlayIntoStudent(student, overlays.get(key))
        : { ...student, matriculaEnrichmentStatus: student?.centralMatricula ? 'ready' : 'missing' }
    })

    if (selectedStudent.value) {
      const selectedKey = normalizeStudentMatricula(selectedStudent.value.matricula)
      selectedStudent.value = students.value.find(student => normalizeStudentMatricula(student.matricula) === selectedKey) || selectedStudent.value
    }
    if (editingStudent.value) {
      const editingKey = normalizeStudentMatricula(editingStudent.value.matricula)
      editingStudent.value = students.value.find(student => normalizeStudentMatricula(student.matricula) === editingKey) || editingStudent.value
    }
    if (operatorInfoStudent.value) {
      const operatorKey = normalizeStudentMatricula(operatorInfoStudent.value.matricula)
      operatorInfoStudent.value = students.value.find(student => normalizeStudentMatricula(student.matricula) === operatorKey) || operatorInfoStudent.value
    }

    const found = financialEnrichmentDiagnostics.value.enriched
    financialEnrichmentState.value = {
      status: found === matriculas.length ? 'ready' : 'partial',
      message: found
        ? 'Matrícula central aplicada como enriquecimiento opcional.'
        : 'Matrícula central respondió sin fichas para las matrículas visibles.',
      requested: Number(response.requested || matriculas.length),
      found: Number(response.found || found),
      error: null,
      lastUpdatedAt: new Date().toISOString()
    }

    if (traceContext) {
      traceContext.resolution.visibleOverlayStatus = found === matriculas.length ? 'ready' : 'partial'
      traceContext.resolution.visibleOverlayFound = Number(response.found || found)
      traceContext.resolution.visibleOverlayRequested = Number(response.requested || matriculas.length)
      upsertFinancialTraceStep(traceContext, 'client', {
        key: 'client-visible-overlay',
        label: 'Revisión visible de matrícula central',
        status: found === matriculas.length ? 'ready' : 'partial',
        ms: financialNow() - overlayStartedAt,
        decision: found === matriculas.length
          ? 'La revisión visible confirmó toda la matrícula central esperada.'
          : 'La revisión visible encontró solo una parte del overlay esperado.',
        why: found === matriculas.length
          ? 'El contraste final no detectó huecos entre lo visible y la respuesta de matrícula.'
          : 'Hay matrículas visibles sin ficha central o aún pendientes de normalización.',
        meta: [
          { label: 'Solicitados', value: Number(response.requested || matriculas.length) },
          { label: 'Encontrados', value: Number(response.found || found) },
        ],
      })
    }

    if (cacheOptions) writeCachedStudents(cacheOptions, students.value)
  } catch (error) {
    if (requestId !== matriculaOverlayRequestId) return
    financialEnrichmentState.value = {
      status: 'failed',
      message: 'No se pudo consultar matrícula central. El estado de cuenta sigue usando la base financiera disponible.',
      requested: matriculas.length,
      found: financialEnrichmentDiagnostics.value.enriched,
      error: error?.data?.message || error?.message || 'matricula-enrichment-failed',
      lastUpdatedAt: new Date().toISOString()
    }
    if (traceContext) {
      traceContext.resolution.visibleOverlayStatus = 'failed'
      traceContext.resolution.visibleOverlayFound = financialEnrichmentDiagnostics.value.enriched
      traceContext.resolution.visibleOverlayRequested = matriculas.length
      upsertFinancialTraceStep(traceContext, 'client', {
        key: 'client-visible-overlay',
        label: 'Revisión visible de matrícula central',
        status: 'failed',
        ms: financialNow() - overlayStartedAt,
        decision: 'La revisión visible terminó degradada.',
        why: error?.data?.message || error?.message || 'La consulta de matrícula central falló y se conservó la base financiera disponible.',
        meta: [
          { label: 'Solicitados', value: matriculas.length },
          { label: 'Encontrados previos', value: financialEnrichmentDiagnostics.value.enriched },
        ],
      })
    }
    console.warn('[Students] central matricula overlay unavailable', error?.message || error)
  }
}

const applyStudentsList = (nextStudents, { selectRouteStudent = true, cacheOptions = null, traceContext = null } = {}) => {
  students.value = (Array.isArray(nextStudents) ? nextStudents : []).map(withControlEscolarProgress)

  readCachedStudentPhotos()

  if (selectedStudent.value) {
    const selectedKey = normalizeStudentMatricula(selectedStudent.value.matricula)
    selectedStudent.value = students.value.find(s => normalizeStudentMatricula(s.matricula) === selectedKey) || selectedStudent.value
  } else if (selectRouteStudent && route.query.q) {
    const match = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(route.query.q))
    if (match) selectStudent(match)
  }

  loadVisibleMatriculaOverlays(
    cacheOptions || { ciclo: normalizeCicloKey(state.value.ciclo), q: filters.value.q || '', enrollmentConcepts: externalConcepts.value, tipoIngresoConcepts: tipoIngresoConcepts.value },
    traceContext,
  )
}

const performSearch = async (options = {}) => {
  const { useCache = true, serverQuery, clearStaleOnCacheMiss = false } = options || {}
  const requestId = ++studentsRequestId
  const cicloKey = normalizeCicloKey(state.value.ciclo)
  const query = serverQuery === undefined ? (filters.value.q || '') : String(serverQuery || '')
  const startedAt = financialNow()

  const cached = useCache ? readCachedStudents({ ciclo: cicloKey, q: query, enrollmentConcepts: externalConcepts.value, tipoIngresoConcepts: tipoIngresoConcepts.value }) : null
  const cachedConcepts = normalizeEnrollmentConceptIds(cached?.enrollmentConcepts)
  const cachedTipoConcepts = normalizeEnrollmentConceptIds(cached?.tipoIngresoConcepts || cachedConcepts)
  const hadStudents = students.value.length > 0
  const trace = createFinancialDiagnosticsTrace({ requestId, useCache, cicloKey, query, hadStudents })

  upsertFinancialTraceStep(trace, 'client', {
    key: 'browser-cache',
    label: 'Resolver caché del navegador',
    status: useCache ? (cached?.students?.length ? 'ready' : 'empty') : 'skipped',
    ms: financialNow() - startedAt,
    decision: useCache
      ? (cached?.students?.length ? 'Se revisó y reutilizó la caché local.' : 'Se revisó la caché local y no hubo material útil.')
      : 'Se omitió la caché local y se forzó red.',
    why: useCache
      ? (cached?.students?.length
        ? 'El flujo permite pintar primero la última copia local para no dejar la pantalla vacía mientras llega la red.'
        : 'La ruta intentó reutilizar caché, pero no había alumnos compatibles con este plantel/ciclo/búsqueda.')
      : 'La acción fue un refresh manual o una ruta que pidió ignorar el navegador.',
    meta: [
      { label: 'Filas caché', value: Number(cached?.count || 0) },
      { label: 'Guardado', value: cached?.savedAt || 'sin registro' },
      { label: 'Consulta', value: query || 'sin búsqueda' },
    ],
  })
  trace.source.browserCache = {
    used: Boolean(cached?.students?.length),
    available: Boolean(cached?.students?.length),
    rows: Number(cached?.count || 0),
    savedAt: cached?.savedAt || '',
    reason: useCache ? (cached?.students?.length ? 'cache_hit' : 'cache_miss') : 'cache_bypassed',
  }

  if (!externalConcepts.value.length && cachedConcepts.length) {
    externalConcepts.value = cachedConcepts
    if (!tipoIngresoConcepts.value.length && cachedTipoConcepts.length) tipoIngresoConcepts.value = cachedTipoConcepts
    cacheEnrollmentConcepts({ current: cachedConcepts, tipoIngreso: cachedTipoConcepts })
    upsertFinancialTraceStep(trace, 'client', {
      key: 'cached-concepts',
      label: 'Restaurar conceptos de inscripción',
      status: 'ready',
      ms: financialNow() - startedAt,
      decision: 'Se restauró la configuración de conceptos desde la caché.',
      why: 'La caché traía firma de conceptos y se reutilizó para que el filtro de inscripción conserve el mismo criterio.',
      meta: [{ label: 'Conceptos', value: cachedConcepts.join(', ') }],
    })
  } else {
    upsertFinancialTraceStep(trace, 'client', {
      key: 'cached-concepts',
      label: 'Restaurar conceptos de inscripción',
      status: cachedConcepts.length ? 'skipped' : 'empty',
      ms: financialNow() - startedAt,
      decision: cachedConcepts.length
        ? 'No hizo falta restaurar conceptos desde la caché.'
        : 'No había firma de conceptos guardada para restaurar.',
      why: cachedConcepts.length
        ? 'La configuración actual ya tenía conceptos cargados y la caché no necesitó intervenir.'
        : 'La caché no aportó conceptos o la búsqueda actual no dependía de ellos.',
      meta: [{ label: 'Conceptos caché', value: cachedConcepts.join(', ') || 'ninguno' }],
    })
  }

  const hasCachedStudents = Boolean(cached?.students?.length)

  if (hasCachedStudents) {
    applyStudentsList(cached.students, { cacheOptions: { ciclo: cicloKey, q: query, enrollmentConcepts: externalConcepts.value, tipoIngresoConcepts: tipoIngresoConcepts.value }, traceContext: trace })
    loading.value = false
    setStudentsSyncState({
      status: 'cached',
      message: 'Mostrando alumnos desde caché local.',
      lastUpdatedAt: cached.savedAt,
      recordCount: cached.count,
      hasCache: true,
      error: null
    })
  } else if (!hadStudents || clearStaleOnCacheMiss) {
    if (clearStaleOnCacheMiss && hadStudents) {
      students.value = []
      matriculaOverlayRequestId++
    }
    loading.value = true
  } else {
    loading.value = false
  }

  setStudentsSyncState({
    status: 'syncing',
    message: hasCachedStudents
      ? 'Mostrando caché local mientras se actualizan los alumnos.'
      : 'Actualizando alumnos en segundo plano.',
    recordCount: hasCachedStudents ? cached.count : students.value.length,
    hasCache: hasCachedStudents || hadStudents,
    error: null
  })

  const bridgeRefreshToken = beginKpiRefreshScope()

  try {
    const serverStartedAt = financialNow()
    const response = await $fetch.raw('/api/students', { params: { ciclo: cicloKey, q: query, concepts: externalConcepts.value.join(','), tipoConcepts: tipoIngresoConcepts.value.join(',') } })
    if (requestId !== studentsRequestId) return
    const headers = readFinancialDiagnosticsHeaders(response)
    trace.source.base = 'bridge:financial.base'
    trace.source.server = headers

    upsertFinancialTraceStep(trace, 'server', {
      key: 'server-financial-base',
      label: 'Leer base financiera del bridge',
      status: headers.bridgeState === 'ready' ? 'ready' : 'partial',
      ms: financialNow() - serverStartedAt,
      decision: headers.bridgeState === 'ready'
        ? 'El bridge respondió y devolvió la base financiera activa.'
        : 'La base financiera respondió en estado no ideal.',
      why: headers.bridgeState === 'ready'
        ? 'La consulta principal al bridge local terminó sin fallback visible del lado del cliente.'
        : 'La respuesta del servidor no marcó bridge listo y debe revisarse junto con el resto de la ruta.',
      meta: [
        { label: 'Filas base', value: headers.baseRows },
        { label: 'Plantel', value: headers.scopedPlantel || 'n/a' },
        { label: 'Modo', value: headers.queryMode || 'scope' },
      ],
    })

    upsertFinancialTraceStep(trace, 'server', {
      key: 'server-central-overlay',
      label: 'Enriquecimiento central dentro del servidor',
      status: headers.overlayStatus || 'idle',
      ms: financialNow() - serverStartedAt,
      decision: headers.overlayStatus === 'ready'
        ? 'El servidor ya devolvió la lista enriquecida con matrícula central.'
        : headers.overlayStatus === 'partial'
          ? 'El servidor enriqueció solo una parte de la lista.'
          : headers.overlayStatus === 'missing'
            ? 'El servidor no encontró overlays centrales para la lista visible.'
            : headers.overlayStatus === 'failed'
              ? 'El enriquecimiento central del servidor falló.'
              : 'El servidor no necesitó o no pudo enriquecer la lista en esta etapa.',
      why: headers.overlayStatus === 'ready'
        ? 'La API principal ya hizo un contraste con matrícula central antes de responder al navegador.'
        : headers.overlayStatus === 'partial'
          ? 'Hay matrículas de la lista sin ficha central encontrada, por eso el servidor solo completó parte de los campos.'
          : headers.overlayStatus === 'missing'
            ? 'La consulta central respondió sin coincidencias para estas matrículas.'
            : headers.overlayStatus === 'failed'
              ? headers.overlayError || 'La capa central no respondió y la base financiera quedó como respaldo visible.'
              : 'No había matrículas visibles o el servidor marcó la etapa como omitida.',
      meta: [
        { label: 'Solicitados', value: headers.overlayRequested },
        { label: 'Encontrados', value: headers.overlayFound },
        { label: 'Motivo', value: headers.overlayReason || 'n/a' },
      ],
    })

    upsertFinancialTraceStep(trace, 'server', {
      key: 'server-cache-refresh',
      label: 'Refresh auxiliar del snapshot Control Escolar',
      status: String(headers.cacheRefresh || '').startsWith('scheduled') ? 'ready' : 'skipped',
      ms: financialNow() - serverStartedAt,
      decision: String(headers.cacheRefresh || '').startsWith('scheduled')
        ? 'Se programó un refresh auxiliar con filas live.'
        : 'No se programó refresh auxiliar en esta llamada.',
      why: String(headers.cacheRefresh || '').startsWith('scheduled')
        ? 'La carga financiera aprovechó las filas vivas para mantener al día el respaldo de Control Escolar.'
        : 'La consulta tenía búsqueda o no era elegible para refrescar el snapshot auxiliar.',
      meta: [
        { label: 'Estado', value: headers.cacheRefresh || 'n/a' },
        { label: 'Conceptos', value: headers.enrollmentConcepts },
      ],
    })

    const freshStudents = Array.isArray(response?._data) ? response._data : []
    applyStudentsList(freshStudents, { cacheOptions: { ciclo: cicloKey, q: query, enrollmentConcepts: externalConcepts.value, tipoIngresoConcepts: tipoIngresoConcepts.value }, traceContext: trace })
    const cacheWritten = writeCachedStudents({ ciclo: cicloKey, q: query, enrollmentConcepts: externalConcepts.value, tipoIngresoConcepts: tipoIngresoConcepts.value }, freshStudents)
    const updatedAt = new Date().toISOString()
    trace.status = 'updated'
    trace.statusLabel = financialStatusLabel('updated')
    trace.totalMs = Math.max(0, Math.round(financialNow() - startedAt))
    trace.resolution.finalRows = freshStudents.length
    trace.resolution.cacheWritten = cacheWritten

    upsertFinancialTraceStep(trace, 'client', {
      key: 'cache-write',
      label: 'Persistir caché local actualizada',
      status: cacheWritten ? 'ready' : 'failed',
      ms: financialNow() - startedAt,
      decision: cacheWritten
        ? 'La nueva lista quedó guardada localmente.'
        : 'La lista se actualizó, pero no pudo quedar guardada localmente.',
      why: cacheWritten
        ? 'Esto permite abrir primero una copia reciente en la siguiente carga si el navegador la puede reutilizar.'
        : 'El navegador rechazó la escritura local o no tenía espacio disponible.',
      meta: [
        { label: 'Filas', value: freshStudents.length },
        { label: 'Consulta', value: query || 'sin búsqueda' },
      ],
    })
    publishFinancialDiagnostics(trace)

    setStudentsSyncState({
      status: 'updated',
      message: cacheWritten
        ? 'Alumnos actualizados y guardados en caché local.'
        : 'Alumnos actualizados. No se pudo guardar la caché local.',
      lastUpdatedAt: updatedAt,
      recordCount: freshStudents.length,
      hasCache: cacheWritten || hasCachedStudents,
      error: cacheWritten ? null : 'cache-write-failed'
    })
  } catch (e) {
    if (requestId !== studentsRequestId) return
    trace.status = hasCachedStudents || hadStudents ? 'failed' : 'unavailable'
    trace.statusLabel = financialStatusLabel(trace.status)
    trace.totalMs = Math.max(0, Math.round(financialNow() - startedAt))
    trace.resolution.finalRows = students.value.length
    trace.source.server.bridgeState = 'failed'
    upsertFinancialTraceStep(trace, 'server', {
      key: 'server-financial-base',
      label: 'Leer base financiera del bridge',
      status: 'failed',
      ms: financialNow() - startedAt,
      decision: 'La lectura principal de la base financiera falló.',
      why: e?.data?.message || e?.message || 'La API principal no respondió correctamente.',
      meta: [
        { label: 'Conservar visibles', value: hasCachedStudents || hadStudents ? 'sí' : 'no' },
        { label: 'Consulta', value: query || 'sin búsqueda' },
      ],
    })
    publishFinancialDiagnostics(trace)

    const canKeepWorking = hasCachedStudents || hadStudents
    setStudentsSyncState({
      status: canKeepWorking ? 'failed' : 'unavailable',
      message: canKeepWorking
        ? 'No se pudo actualizar. Se conservan los alumnos disponibles.'
        : 'No se pudo cargar la base de datos.',
      recordCount: students.value.length,
      hasCache: canKeepWorking,
      error: e?.data?.message || e?.message || 'students-sync-failed'
    })

    if (!canKeepWorking) show('Error al cargar la base de datos', 'danger')
  } finally {
    endKpiRefreshScope(bridgeRefreshToken)
    if (requestId === studentsRequestId) loading.value = false
  }
}

const refreshStudentsFromServer = () => performSearch({ useCache: false, serverQuery: '' })
const refreshStudentsAndKpis = async () => {
  await refreshStudentsFromServer()
  await Promise.allSettled([loadGlobalKpis(), loadKpiSparklines()])
}
const refreshAfterStudentMutation = () => refreshStudentsAndKpis()

const enrollmentConceptIds = computed(() => normalizeEnrollmentConceptIds(externalConcepts.value))
const enrollmentConceptIdSet = computed(() => new Set(enrollmentConceptIds.value))
const hasEnrollmentConceptConfig = computed(() => enrollmentConceptIds.value.length > 0)

const hasMatchingEnrollmentConcept = (values) => {
  if (!hasEnrollmentConceptConfig.value) return false
  const target = enrollmentConceptIdSet.value
  return normalizeEnrollmentConceptIds(values).some(conceptId => target.has(conceptId))
}

const hasCurrentEnrollmentConcept = (student) => {
  if (student?.currentEnrollmentConceptMatch === true || student?.inscritoCicloActual === true) return true
  return hasMatchingEnrollmentConcept([
  student?.tipoIngresoEvidence?.targetConceptIds,
  student?.tipoIngresoEvidence?.targetConceptosIds,
  student?.tipoIngresoEvidence?.targetConcepts,
  student?.tipoIngresoEvidence?.targetConceptos,
  student?.conceptoIdsTarget,
  student?.conceptoIdsTargetCiclo,
  student?.conceptoIdsCicloActual,
  student?.conceptoIdsPagados,
  student?.conceptoIdsCargados,
  student?.conceptoIds,
  student?.conceptosIds
])
}

const isEnrolled = (student) => student?.estatus === 'Activo' && hasCurrentEnrollmentConcept(student)
const isNoInscritoForSelectedCiclo = (student) => (
  student?.estatus === 'Activo'
  && !hasCurrentEnrollmentConcept(student)
)
const isBajaInscritaCurrent = (student) => student?.estatus !== 'Activo' && hasCurrentEnrollmentConcept(student)
const resolveStudentTipoIngreso = (student) => resolveTipoIngreso(student, currentCicloKey.value, { enrollmentConcepts: tipoIngresoConcepts.value.length ? tipoIngresoConcepts.value : externalConcepts.value })

const kpiCounts = computed(() => {
  let inscritos = 0, internos = 0, externos = 0, no_inscritos = 0, bajas = 0
  students.value.forEach(s => {
    if (isEnrolled(s)) {
      inscritos++
      const tipoIngreso = resolveStudentTipoIngreso(s)
      if (tipoIngreso.value === 'interno') internos++
      else externos++
    } else if (isNoInscritoForSelectedCiclo(s)) {
      no_inscritos++
    } else if (isBajaInscritaCurrent(s)) {
      bajas++
    }
  })
  return { inscritos, internos, externos, no_inscritos, bajas }
})

const studentMatchesActiveFilter = (student) => {
  if (activeFilter.value === 'inscritos') return isEnrolled(student)
  if (activeFilter.value === 'internos') return isEnrolled(student) && resolveStudentTipoIngreso(student).value === 'interno'
  if (activeFilter.value === 'externos') return isEnrolled(student) && resolveStudentTipoIngreso(student).value === 'externo'
  if (activeFilter.value === 'no_inscritos') return isNoInscritoForSelectedCiclo(student)
  if (activeFilter.value === 'bajas') return isBajaInscritaCurrent(student)
  if (isSectionFilter(activeFilter.value)) return studentHasSection(student, sectionIdFromFilter(activeFilter.value))
  return true
}

const studentMatchesSaldoFilter = (student) => {
  if (activeSaldoFilter.value === 'debt') return Number(student?.saldoNeto || 0) > 0
  return true
}

const displayedStudents = computed(() => {
  let list = students.value

  if (filters.value.q) {
    const qTerm = filters.value.q.toLowerCase()
    list = list.filter(s => s.nombreCompleto.toLowerCase().includes(qTerm) || s.matricula.toLowerCase().includes(qTerm))
  }

  if (activeGrado.value) list = list.filter(s => s.grado === activeGrado.value)
  if (activeGrupo.value) list = list.filter(s => s.grupo === activeGrupo.value)

  if (activeFilter.value) list = list.filter(studentMatchesActiveFilter)
  if (activeSaldoFilter.value !== 'all') list = list.filter(studentMatchesSaldoFilter)

  return list
})

watch(displayedStudents, () => {
  const selectedKey = normalizeStudentMatricula(selectedStudent.value?.matricula)
  if (!selectedKey) return

  const selectedStillLoaded = students.value.some(student => normalizeStudentMatricula(student.matricula) === selectedKey)
  if (selectedStillLoaded) {
    selectedStudent.value = students.value.find(student => normalizeStudentMatricula(student.matricula) === selectedKey) || selectedStudent.value
  }
}, { flush: 'post' })

const resetInvalidDashboardFilters = () => {
  if (loading.value) return

  const normalizedFilter = normalizeDashboardFilter(activeFilter.value)
  if (activeFilter.value !== normalizedFilter) activeFilter.value = normalizedFilter

  if (activeGrado.value && !availableGrados.value.includes(activeGrado.value)) {
    activeGrado.value = ''
    activeGrupo.value = ''
  }

  if (activeGrupo.value && !availableGrupos.value.includes(activeGrupo.value)) {
    activeGrupo.value = ''
  }
}


const availableGrados = computed(() => {
  const set = new Set()
  const subset = students.value.filter(student => studentMatchesActiveFilter(student) && studentMatchesSaldoFilter(student))
  subset.forEach(s => { if (s.grado && s.grado !== 'null') set.add(s.grado) })
  return Array.from(set).sort((a, b) => (GRADOS_ORDEN[a] || 99) - (GRADOS_ORDEN[b] || 99))
})

const availableGrupos = computed(() => {
  if (!activeGrado.value) return []
  const set = new Set()
  students.value.forEach(s => {
    if (s.grado === activeGrado.value && studentMatchesActiveFilter(s) && studentMatchesSaldoFilter(s) && s.grupo && s.grupo !== 'null') set.add(s.grupo)
  })
  return Array.from(set).sort()
})

watch(
  () => [
    activeFilter.value,
    customSections.value.map(section => section.id).join('|'),
    activeGrado.value,
    activeGrupo.value,
    loading.value,
    availableGrados.value.join('|'),
    availableGrupos.value.join('|')
  ],
  resetInvalidDashboardFilters,
  { flush: 'post' }
)

const exportData = () => {
  const exportCiclo = currentCicloKey.value
  const exportList = displayedStudents.value.map((s) => {
    const tipoIngreso = resolveStudentTipoIngreso(s)
    const familyContact = resolveFinancialFamilyContact(s)
    const central = s.centralMatricula || {}
    const centralRaw = s.centralMatriculaRaw || central.raw || null
    const centralFamilyContact = resolveFinancialFamilyContact({ centralMatricula: central, centralMatriculaRaw: centralRaw })

    return {
      Matrícula: s.matricula,
      Nombre: s.nombreCompleto,
      Tipo: formatTipoIngresoValue(tipoIngreso),
      Ciclo_Exportado: exportCiclo,
      Ciclo_Ingreso: s.cicloBase || s.ciclo || '',
      Tipo_Fuente: tipoIngreso.source,
      Tipo_Razon: tipoIngreso.reason,
      Nivel: studentNivelLabel(s),
      Grado: s.grado,
      Grupo: s.grupo,
      Plantel: s.plantel || '',
      Tutor: familyContact.tutorName || s.padre || s['Nombre del padre o tutor'] || '',
      Telefono: familyContact.phone || s.telefono || '',
      Correo: familyContact.email || s.correo || '',
      Control_Escolar_Enriquecido: s.matriculaEnrichmentStatus === 'ready' ? 'Sí' : 'No',
      Control_Escolar_Padre_Nombre: centralFamilyContact.fatherName || '',
      Control_Escolar_Padre_Telefono: centralFamilyContact.fatherPhone || '',
      Control_Escolar_Padre_Correo: centralFamilyContact.fatherEmail || '',
      Control_Escolar_Madre_Nombre: centralFamilyContact.motherName || '',
      Control_Escolar_Madre_Telefono: centralFamilyContact.motherPhone || '',
      Control_Escolar_Madre_Correo: centralFamilyContact.motherEmail || '',
      Control_Escolar_CURP: central.curp || s.curp || '',
      Control_Escolar_Nombre_Verificado: central.nombreVerificado || '',
      Control_Escolar_Nombre_Completo_Alumno: central.nombreCompletoAlumno || central.nombreCompleto || '',
      Control_Escolar_Nombres: central.nombres || '',
      Control_Escolar_Apellido_Paterno: central.apellidoPaterno || '',
      Control_Escolar_Apellido_Materno: central.apellidoMaterno || '',
      Control_Escolar_Nivel: central.nivel || '',
      Control_Escolar_Grado: central.grado || '',
      Control_Escolar_Grupo: central.grupo || '',
      Control_Escolar_Plantel: central.plantel || '',
      Control_Escolar_Fecha_Nacimiento: central.fechaNacimiento || '',
      Control_Escolar_Lugar_Nacimiento: central.lugarNacimiento || '',
      Control_Escolar_Sexo: central.sexo || '',
      Control_Escolar_Talla: central.talla || '',
      Control_Escolar_Peso: central.peso || '',
      Control_Escolar_Tipo_Sangre: central.tipoSangre || '',
      Control_Escolar_Alergias: central.alergias || '',
      Control_Escolar_Direccion: central.direccion || '',
      Control_Escolar_Domicilio_Calle: central.domicilioCalle || '',
      Control_Escolar_Domicilio_Numero: central.domicilioNumero || central.domicilioNum || '',
      Control_Escolar_Domicilio_Colonia: central.domicilioColonia || '',
      Control_Escolar_Domicilio_CP: central.domicilioCp || '',
      Control_Escolar_Domicilio_Municipio: central.domicilioMunicipio || '',
      Control_Escolar_Padre_Nombres: central.nombrePadre || '',
      Control_Escolar_Padre_Apellido_Paterno: central.apellidoPaternoPadre || '',
      Control_Escolar_Padre_Apellido_Materno: central.apellidoMaternoPadre || '',
      Control_Escolar_Padre_Ocupacion: central.ocupacionPadre || '',
      Control_Escolar_Padre_Lugar_Trabajo: central.lugarTrabajoPadre || '',
      Control_Escolar_Padre_Puesto: central.puestoPadre || '',
      Control_Escolar_Padre_Estado_Civil: central.estadoCivilPadre || '',
      Control_Escolar_Padre_Fecha_Nacimiento: central.fechaNacimientoPadre || '',
      Control_Escolar_Padre_INE: central.inePadre || '',
      Control_Escolar_Padre_CURP: central.curpPadre || '',
      Control_Escolar_Madre_Nombres: central.nombreMadre || '',
      Control_Escolar_Madre_Apellido_Paterno: central.apellidoPaternoMadre || '',
      Control_Escolar_Madre_Apellido_Materno: central.apellidoMaternoMadre || '',
      Control_Escolar_Madre_Ocupacion: central.ocupacionMadre || '',
      Control_Escolar_Madre_Lugar_Trabajo: central.lugarTrabajoMadre || '',
      Control_Escolar_Madre_Puesto: central.puestoMadre || '',
      Control_Escolar_Madre_Estado_Civil: central.estadoCivilMadre || '',
      Control_Escolar_Madre_Fecha_Nacimiento: central.fechaNacimientoMadre || '',
      Control_Escolar_Madre_INE: central.ineMadre || '',
      Control_Escolar_Madre_CURP: central.curpMadre || '',
      Control_Escolar_Interno: central.interno || '',
      Control_Escolar_Servicio: central.servicio || '',
      Control_Escolar_Foto: central.foto || '',
      Control_Escolar_Actualizado: central.updatedAt || '',
      Control_Escolar_RAW_JSON: centralRaw ? JSON.stringify(centralRaw) : '',
      Fecha_Nacimiento: s.birth || s['Fecha de nacimiento'] || '',
      Matricula_Anterior: s.matriculaAnterior || '',
      Matricula_Siguiente: s.matriculaSiguiente || '',
      Cargos_MXN: Number(s.importeTotal).toFixed(2),
      Pagos_MXN: Number(s.pagosTotal).toFixed(2),
      Saldo_MXN: Number(s.saldoNeto).toFixed(2),
      Estatus: s.estatus,
      Secciones: (s.customSections || []).map(section => section.name).join(' | ')
    }
  })
  exportToCSV(`Alumnos_${exportCiclo}.csv`, exportList)
}

const selectStudent = (student) => {
  selectedStudent.value = student
  bulkWorkspaceMode.value = 'none'
  resetBulkPayments()
}
const openSelectionDetails = () => {
  if (selectedCount.value > 1) {
    selectedStudent.value = null
    bulkWorkspaceMode.value = 'bulk'
    scheduleWorkspaceOrientationUpdate()
    return
  }
  const target = selectionPrimaryStudent.value
  if (target) selectStudent(target)
}

const openBulkPaymentFlow = async () => {
  if (!selectedCount.value) return
  if (selectedCount.value === 1) {
    const target = selectionPrimaryStudent.value
    if (target) selectStudent(target)
    return
  }
  selectedStudent.value = null
  bulkWorkspaceMode.value = 'bulk-payment'
  await loadBulkPaymentDebts()
  scheduleWorkspaceOrientationUpdate()
}

const openBulkIngresoCycleFlow = () => {
  if (!selectedCount.value) return
  selectedStudent.value = null
  bulkIngresoResult.value = null
  showBulkIngresoCycleModal.value = true
}

const openNoAdeudoForStudent = (student) => {
  if (!student) return
  noAdeudoStudents.value = [findCanonicalStudent(student)]
}

const openNoAdeudoForSelection = () => {
  if (!selectedCount.value) return
  const targets = selectedStudents.value.length
    ? selectedStudents.value.map(findCanonicalStudent)
    : (selectionPrimaryStudent.value ? [findCanonicalStudent(selectionPrimaryStudent.value)] : [])
  noAdeudoStudents.value = targets
}

const handleNoAdeudoSent = async (response) => {
  noAdeudoStudents.value = []
  const sent = Number(response?.sent || 0)
  const failed = Number(response?.failed || 0)
  show(
    `${sent} carta${sent === 1 ? '' : 's'} de no adeudo enviada${sent === 1 ? '' : 's'}${failed ? `; ${failed} fallida${failed === 1 ? '' : 's'}` : ''}.`,
    failed ? 'warning' : 'success'
  )
  await refreshAfterStudentMutation()
}

const closeBulkIngresoCycleModal = () => {
  if (bulkIngresoSaving.value) return
  showBulkIngresoCycleModal.value = false
  bulkIngresoResult.value = null
}

const removeStudentFromSelection = (matricula) => {
  const normalized = normalizeStudentMatricula(matricula)
  if (!normalized) return
  setSelectedMatriculas(Array.from(selectedMatriculas.value).filter(value => value !== normalized))
  if (!selectedCount.value) closeBulkIngresoCycleModal()
}

const applyBulkIngresoCycleResult = (results = []) => {
  const updates = new Map()
  results.forEach((row) => {
    if (row?.status !== 'updated' || !row.student?.matricula) return
    updates.set(normalizeStudentMatricula(row.student.matricula), row.student)
  })
  if (!updates.size) return

  students.value = students.value.map((student) => {
    const key = normalizeStudentMatricula(student.matricula)
    const update = updates.get(key)
    if (!update) return student
    const merged = {
      ...student,
      ...update,
      ciclo: update.ciclo || update.cicloBase || student.ciclo,
      cicloBase: update.cicloBase || update.ciclo || student.cicloBase
    }
    return {
      ...merged,
      tipoIngreso: resolveStudentTipoIngreso(merged)
    }
  })
}

const submitBulkIngresoCycle = async (payload) => {
  if (bulkIngresoSaving.value || !selectedCount.value) return
  bulkIngresoSaving.value = true

  try {
    const res = await $fetch('/api/students/bulk-ingreso-cycle', {
      method: 'PUT',
      body: {
        ...payload,
        matriculas: Array.from(selectedMatriculas.value)
      }
    })

    bulkIngresoResult.value = res
    applyBulkIngresoCycleResult(res?.results || [])
    const failedMatriculas = (res?.results || [])
      .filter(row => row?.status === 'failed')
      .map(row => normalizeStudentMatricula(row?.matricula))
      .filter(Boolean)

    if (failedMatriculas.length) setSelectedMatriculas(failedMatriculas)
    else {
      clearStudentSelection()
      bulkWorkspaceMode.value = 'none'
    }

    await refreshAfterStudentMutation()
    show(`${res?.updated || 0} alumnos actualizados`, (res?.failed || 0) ? 'warning' : 'success')
  } catch (e) {
    show(e?.data?.message || e?.message || 'No se pudo actualizar la selección', 'danger')
  } finally {
    bulkIngresoSaving.value = false
  }
}

const closeBulkWorkspace = () => {
  bulkWorkspaceMode.value = 'none'
  resetBulkPayments()
}

const clearSelectedStudents = () => {
  clearStudentSelection()
  bulkWorkspaceMode.value = 'none'
  resetBulkPayments()
}

const handleStudentRowClick = (student, event) => {
  if (event?.target?.closest?.('button, a, input, label')) return
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey) {
    toggleStudentSelection(student, event)
    return
  }
  if (selectedCount.value > 0) {
    toggleStudentSelection(student, event)
    return
  }
  selectStudent(student)
}

const selectStudentByMatricula = (matricula) => {
  const match = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(matricula))
  if (match) selectStudent(match)
}

const bajaAlumno = (student) => {
  pendingBulkBajaStudents.value = []
  pendingBajaStudent.value = student
}

const openBulkBajaFlow = () => {
  if (!selectedCount.value) return
  pendingBajaStudent.value = null
  pendingBulkBajaStudents.value = selectedStudents.value.map(findCanonicalStudent).filter(Boolean)
}

const closeBajaModal = () => {
  if (bulkBajaSaving.value) return
  pendingBajaStudent.value = null
  pendingBulkBajaStudents.value = []
}

const applyBulkBajaResult = (results = [], motivo = '') => {
  const updated = new Set(results
    .filter(row => row?.status === 'updated')
    .map(row => normalizeStudentMatricula(row?.matricula))
    .filter(Boolean))

  if (!updated.size) return

  students.value = students.value.map((student) => {
    const key = normalizeStudentMatricula(student?.matricula)
    return updated.has(key) ? { ...student, estatus: motivo } : student
  })

  if (selectedStudent.value && updated.has(normalizeStudentMatricula(selectedStudent.value.matricula))) {
    selectedStudent.value = { ...selectedStudent.value, estatus: motivo }
  }
}

const confirmBulkBaja = async (motivo) => {
  if (bulkBajaSaving.value || !pendingBulkBajaStudents.value.length || !motivo) return
  bulkBajaSaving.value = true

  try {
    const res = await $fetch('/api/students/bulk-baja', {
      method: 'PUT',
      body: {
        motivo,
        matriculas: pendingBulkBajaStudents.value.map(student => student?.matricula).filter(Boolean)
      }
    })

    applyBulkBajaResult(res?.results || [], motivo)
    const failedMatriculas = (res?.results || [])
      .filter(row => row?.status === 'failed')
      .map(row => normalizeStudentMatricula(row?.matricula))
      .filter(Boolean)

    if (failedMatriculas.length) setSelectedMatriculas(failedMatriculas)
    else {
      clearStudentSelection()
      bulkWorkspaceMode.value = 'none'
      resetBulkPayments()
    }

    pendingBulkBajaStudents.value = []
    await refreshAfterStudentMutation()

    const updated = Number(res?.updated || 0)
    const skipped = Number(res?.skipped || 0)
    const failed = Number(res?.failed || 0)
    const extra = [
      skipped ? `${skipped} omitido${skipped === 1 ? '' : 's'}` : '',
      failed ? `${failed} fallido${failed === 1 ? '' : 's'}` : ''
    ].filter(Boolean).join('; ')
    show(`${updated} baja${updated === 1 ? '' : 's'} aplicada${updated === 1 ? '' : 's'}${extra ? `; ${extra}` : ''}.`, failed ? 'warning' : 'success')
  } catch (e) {
    show(e?.data?.message || e?.message || 'No se pudo procesar la baja masiva', 'danger')
  } finally {
    bulkBajaSaving.value = false
  }
}

const confirmBaja = async (motivo) => {
  if (pendingBulkBajaStudents.value.length > 1) {
    await confirmBulkBaja(motivo)
    return
  }

  const student = pendingBajaStudent.value || pendingBulkBajaStudents.value[0]
  if (!student || !motivo) return
  const previousEstatus = student.estatus

  try {
    await executeOptimistic(
      () => $fetch(`/api/students/${student.matricula}`, { method: 'DELETE', body: { motivo } }),
      () => {
        const s = students.value.find(x => x.matricula === student.matricula)
        if (s) s.estatus = motivo
      },
      () => {
        const s = students.value.find(x => x.matricula === student.matricula)
        if (s) s.estatus = previousEstatus
        refreshAfterStudentMutation()
      },
      { pending: 'Procesando baja...', success: 'Alumno dado de baja exitosamente', error: 'Fallo al procesar baja' }
    )
    closeBajaModal()
    await refreshAfterStudentMutation()
  } catch (e) {}
}


const handleIngresoCycleUpdated = (payload) => {
  if (!payload?.matricula) return
  const matricula = normalizeStudentMatricula(payload.matricula)

  students.value = students.value.map((student) => {
    if (normalizeStudentMatricula(student.matricula) !== matricula) return student
    const updated = {
      ...student,
      ...payload,
      ciclo: payload.ciclo || payload.cicloBase || student.ciclo,
      cicloBase: payload.cicloBase || payload.ciclo || student.cicloBase
    }
    return {
      ...updated,
      tipoIngreso: resolveStudentTipoIngreso(updated)
    }
  })

  if (selectedStudent.value && normalizeStudentMatricula(selectedStudent.value.matricula) === matricula) {
    selectedStudent.value = students.value.find(student => normalizeStudentMatricula(student.matricula) === matricula) || selectedStudent.value
  }
}

const findCanonicalStudent = (student) => {
  const key = normalizeStudentMatricula(student?.matricula)
  return key
    ? students.value.find((candidate) => normalizeStudentMatricula(candidate?.matricula) === key) || student
    : student
}

const openStudentOperatorInfo = (student) => {
  if (!canOpenStudentOperatorInfo.value) return
  operatorInfoStudent.value = findCanonicalStudent(student)
}

const openFinancialDiagnosticsModal = () => {
  showFinancialDiagnosticsModal.value = true
}

const closeFinancialDiagnosticsModal = () => {
  showFinancialDiagnosticsModal.value = false
}

useModalEscape(closeFinancialDiagnosticsModal, { enabled: showFinancialDiagnosticsModal })

const showStudentMenu = (event, student) => {
  const selectedActionLabel = selectedCount.value > 1 && isStudentSelected(student)
    ? `Asignar sección a ${selectedCount.value}`
    : 'Asignar seccion'

  const actions = [
    { label: 'Ver detalles', icon: LucideEye, action: () => selectStudent(student) },
    { label: 'Carta no adeudo', icon: LucideShieldCheck, action: () => openNoAdeudoForStudent(student) }
  ]

  if (canOpenStudentOperatorInfo.value) {
    actions.push({ label: 'Ver información de alumno', icon: LucideBookOpen, action: () => openStudentOperatorInfo(student) })
  }

  actions.push(
    { label: '-' },
    { label: 'Editar alumno', icon: LucideSettings, action: () => openEdit(student) },
    { label: selectedActionLabel, icon: LucideTags, action: () => (selectedCount.value > 1 && isStudentSelected(student) ? openSectionModalForSelection() : openSectionModal(student)) },
    { label: isStudentSelected(student) ? 'Quitar de selección' : 'Seleccionar', icon: LucideTag, action: () => toggleStudentSelection(student) },
    { label: '-' },
    { label: 'Dar de baja', icon: LucideUserX, class: 'text-accent-coral font-bold', disabled: student.estatus !== 'Activo', action: () => bajaAlumno(student) }
  )

  openMenu(event, actions)
}

const loadEnrollmentConfig = async ({ refreshStudents = false, refreshKpis = true } = {}) => {
  const previousConcepts = externalConcepts.value.join('|')
  const previousTipoConcepts = tipoIngresoConcepts.value.join('|')
  const refreshToken = beginKpiRefreshScope()

  try {
    const configData = await $fetch('/api/conceptos-config/all')
    parseEnrollmentConfig(configData)
  } catch (e) {
    console.warn('Fallback al carecer de configuración externa.')
  } finally {
    endKpiRefreshScope(refreshToken)
  }

  const nextConcepts = externalConcepts.value.join('|')
  const nextTipoConcepts = tipoIngresoConcepts.value.join('|')
  if (refreshKpis) await Promise.allSettled([loadGlobalKpis(), loadKpiSparklines()])

  if (refreshStudents && nextConcepts && (nextConcepts !== previousConcepts || nextTipoConcepts !== previousTipoConcepts)) {
    await refreshStudentsFromServer()
  }
}

onMounted(() => {
  if (process.client) {
    const savedWorkspaceSplit = Number(localStorage.getItem(WORKSPACE_SPLIT_STORAGE_KEY))
    const savedWorkspaceStack = Number(localStorage.getItem(WORKSPACE_STACK_STORAGE_KEY))
    if (Number.isFinite(savedWorkspaceSplit)) workspaceSplitPercent.value = clampWorkspaceSplit(savedWorkspaceSplit)
    if (Number.isFinite(savedWorkspaceStack)) workspaceStackPercent.value = clampWorkspaceStack(savedWorkspaceStack)
    scheduleWorkspaceOrientationUpdate()
    if (typeof ResizeObserver !== 'undefined') {
      workspaceResizeObserver = new ResizeObserver(scheduleWorkspaceOrientationUpdate)
      if (studentsWorkspaceEl.value) workspaceResizeObserver.observe(studentsWorkspaceEl.value)
    }
    window.addEventListener('financial:open-sync-diagnostics', openFinancialDiagnosticsModal)
  }
  if (route.query.q) filters.value.q = String(route.query.q)
  hydrateCachedEnrollmentConcepts()
  loadCustomSections()
  performSearch({ useCache: true })
  loadEnrollmentConfig({ refreshStudents: true })
})


watch(selectedStudent, scheduleWorkspaceOrientationUpdate)

watch(selectedCount, (count) => {
  if (count <= 1 && bulkWorkspaceMode.value !== 'none') bulkWorkspaceMode.value = 'none'
  if (count > 1 && bulkWorkspaceMode.value === 'none') {
    selectedStudent.value = null
    bulkWorkspaceMode.value = 'bulk'
  }
  if (bulkWorkspaceMode.value === 'bulk-payment') loadBulkPaymentDebts()
  scheduleWorkspaceOrientationUpdate()
})

watch(() => selectedStudents.value.map(student => student.matricula).join('|'), () => {
  if (bulkWorkspaceMode.value === 'bulk-payment') loadBulkPaymentDebts()
})

watch(bulkWorkspaceMode, scheduleWorkspaceOrientationUpdate)


watch(activeFilter, (nextFilter) => {
  const normalizedFilter = normalizeDashboardFilter(nextFilter)
  if (nextFilter !== normalizedFilter) activeFilter.value = normalizedFilter
})

watch(
  () => [currentCicloKey.value, externalConcepts.value.join('|'), tipoIngresoConcepts.value.join('|'), students.value.length],
  () => {
    if (!activeFilter.value) activeFilter.value = DEFAULT_KPI_FILTER
  },
  { flush: 'post' }
)

const hasActiveBridgeRefreshSignal = () => (
  studentsSyncState.value.status === 'syncing' ||
  accountStateSyncState.value.status === 'syncing'
)

watch(
  () => ({
    status: studentsSyncState.value.status,
    hasCache: studentsSyncState.value.hasCache,
    count: students.value.length
  }),
  ({ status, hasCache, count }) => {
    if (status === 'syncing' && (hasCache || count > 0)) {
      startKpiRefresh()
    } else if (!activeKpiRefreshScopes.size && !hasActiveBridgeRefreshSignal()) {
      stopKpiRefresh()
    }
  },
  { immediate: true }
)

watch(
  () => ({
    status: accountStateSyncState.value.status,
    hasCache: accountStateSyncState.value.hasCache,
    count: accountStateSyncState.value.recordCount
  }),
  ({ status, hasCache, count }) => {
    if (status === 'syncing' && (hasCache || count > 0 || selectedStudent.value)) {
      startKpiRefresh()
    } else if (!activeKpiRefreshScopes.size && !hasActiveBridgeRefreshSignal()) {
      stopKpiRefresh()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (process.client) {
    window.removeEventListener('financial:open-sync-diagnostics', openFinancialDiagnosticsModal)
    window.removeEventListener('pointermove', onWorkspaceResizeMove)
    window.removeEventListener('pointerup', stopWorkspaceResize)
    window.removeEventListener('pointercancel', stopWorkspaceResize)
    if (workspaceResizeFrame) window.cancelAnimationFrame(workspaceResizeFrame)
    document.body.classList.remove('students-workspace-resizing')
    document.body.classList.remove('students-workspace-resizing-stacked')
  }
  workspaceResizeObserver?.disconnect?.()
  clearKpiRefreshTimer()
})

let cicloRefreshRequestId = 0
const refreshForCicloChange = async () => {
  const requestId = ++cicloRefreshRequestId
  matriculaOverlayRequestId++
  clearStudentSelection()
  bulkWorkspaceMode.value = 'none'
  resetBulkPayments()
  activeGrado.value = ''
  activeGrupo.value = ''
  activeSaldoFilter.value = 'all'
  externalConcepts.value = []
  tipoIngresoConcepts.value = []
  hydrateCachedEnrollmentConcepts()

  await loadEnrollmentConfig({ refreshStudents: false, refreshKpis: false })
  if (requestId !== cicloRefreshRequestId) return

  await performSearch({ useCache: true, clearStaleOnCacheMiss: true })
  if (requestId !== cicloRefreshRequestId) return

  await Promise.allSettled([loadGlobalKpis(), loadKpiSparklines()])
}

watch(() => state.value.ciclo, () => {
  refreshForCicloChange()
})

const openAlta = () => { editingStudent.value = null; showStudentModal.value = true }
const openEdit = (studentData) => { editingStudent.value = findCanonicalStudent(studentData); showStudentModal.value = true }
const closeStudentModal = () => { showStudentModal.value = false; editingStudent.value = null }

const handleStudentSuccess = () => {
  closeStudentModal()
  refreshAfterStudentMutation()
}
</script>
