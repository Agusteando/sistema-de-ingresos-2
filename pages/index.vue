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

    <div ref="studentsScaleShell" class="students-scale-shell" :style="studentsScaleShellStyle">
      <div class="students-design-canvas" :style="studentsDesignCanvasStyle">
        <div :class="['students-workspace', { 'has-detail': hasAccountWorkspace }]">
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
            @clear-selected="clearSelectedStudents"
            @change-bulk-payment-method="bulkPaymentMethod = $event"
            @back-to-bulk="bulkWorkspaceMode = 'bulk'"
            @submit-bulk-payments="submitBulkPayments"
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
      @clear-selected="clearSelectedStudents"
    />

    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
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
    <BajaReasonModal v-if="pendingBajaStudent" :student="pendingBajaStudent" @close="pendingBajaStudent = null" @confirm="confirmBaja" />
    <StudentOperatorInfoModal
      v-if="operatorInfoStudent"
      :student="operatorInfoStudent"
      @close="operatorInfoStudent = null"
    />

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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { useHead } from '#imports'
import { LucideBookOpen, LucideEye, LucideSettings, LucideTag, LucideTags, LucideUserX } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { useStudentsWorkspaceScale } from '~/composables/useStudentsWorkspaceScale'
import { useStudentSelection } from '~/composables/useStudentSelection'
import { useStudentSections } from '~/composables/useStudentSections'
import { useStudentBulkPayments } from '~/composables/useStudentBulkPayments'
import { useStudentsCacheSync } from '~/composables/useStudentsCacheSync'
import { exportToCSV } from '~/utils/export'
import { GRADOS_ORDEN } from '~/utils/constants'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { formatTipoIngresoValue, resolveTipoIngreso } from '~/shared/utils/tipoIngreso'
import {
  formatMoney,
  gradeVisualTitle,
  isSectionFilter,
  normalizeStudentMatricula,
  normalizeEnrollmentConceptIds,
  parseEnrollmentConcepts,
  photoStorageKey,
  sectionIdFromFilter,
  studentGroupLabel,
  studentHasSection,
  studentNivelLabel
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

const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const route = useRoute()
useHead({ bodyAttrs: { class: 'students-route-active' } })
const { studentsSyncState, readCachedStudents, writeCachedStudents, setStudentsSyncState } = useStudentsCacheSync()
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')
const roleTokens = computed(() => String(userRole.value || '').split(',').map(role => role.trim().toLowerCase()).filter(Boolean))
const isSuperAdminRole = computed(() => roleTokens.value.some(role => ['global', 'superadmin', 'role_super_admin', 'role_superadmin'].includes(role)))
const isControlEscolarOnly = computed(() => !isSuperAdminRole.value && roleTokens.value.includes('role_ctrl'))
const canOpenStudentOperatorInfo = computed(() => !isControlEscolarOnly.value)

const filters = ref({ q: '' })
const activeFilter = ref('inscritos')
const activeGrado = ref('')
const activeGrupo = ref('')
const activeSaldoFilter = ref('all')

const externalConcepts = ref([])
const ENROLLMENT_CONCEPTS_CACHE_KEY = 'students-enrollment-concepts:v1'
const currentCicloKey = computed(() => normalizeCicloKey(state.value.ciclo))

const students = ref([])
const loading = ref(false)
const studentsSourceUnavailable = computed(() => studentsSyncState.value.status === 'unavailable' && !students.value.length && !loading.value)
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
const operatorInfoStudent = ref(null)
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
  refreshStudents: () => performSearch({ useCache: false }),
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
const accountWorkspaceMode = computed(() => {
  if (selectedCount.value > 1 && bulkWorkspaceMode.value === 'bulk-payment') return 'bulk-payment'
  if (selectedCount.value > 1 && bulkWorkspaceMode.value === 'bulk') return 'bulk'
  if (selectedStudent.value) return 'detail'
  return 'none'
})

const {
  studentsScaleShell,
  studentsScaleShellStyle,
  studentsDesignCanvasStyle,
  scheduleWorkspaceScaleUpdate
} = useStudentsWorkspaceScale(hasAccountWorkspace)
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
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    if (!externalConcepts.value.length) {
      paymentKpiSparklines.value = { inscritos: [], internos: [], externos: [], ingresos: [] }
      return
    }

    const res = await $fetch('/api/students/kpi-trends', {
      params: {
        ciclo: cicloKey,
        concepts: externalConcepts.value.join(',')
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


const cacheEnrollmentConcepts = (conceptIds) => {
  if (!process.client || !Array.isArray(conceptIds) || !conceptIds.length) return
  try {
    localStorage.setItem(ENROLLMENT_CONCEPTS_CACHE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      concepts: conceptIds
    }))
  } catch (error) {
    console.warn('[Enrollment concepts cache] Could not persist enrollment concepts.', error)
  }
}

const hydrateCachedEnrollmentConcepts = () => {
  if (!process.client || externalConcepts.value.length) return
  try {
    const parsed = JSON.parse(localStorage.getItem(ENROLLMENT_CONCEPTS_CACHE_KEY) || 'null')
    const conceptIds = normalizeEnrollmentConceptIds(parsed?.concepts)
    if (conceptIds.length) externalConcepts.value = conceptIds
  } catch (error) {
    console.warn('[Enrollment concepts cache] Could not read enrollment concepts.', error)
  }
}

const parseEnrollmentConfig = (obj) => {
  const conceptIds = parseEnrollmentConcepts(obj)
  if (!conceptIds.length) {
    console.warn('[Enrollment concepts] Remote config did not include enrollment concept ids; preserving the current local concepts.')
    return
  }

  externalConcepts.value = conceptIds
  cacheEnrollmentConcepts(conceptIds)
}

const loadGlobalKpis = async () => {
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch('/api/dashboard/kpis', { params: { ciclo: cicloKey, concepts: externalConcepts.value.join(',') } })
    globalKpis.value.ingresosMes = res.ingresosMes || 0
  } catch(e) {}
}

let studentsRequestId = 0

const applyStudentsList = (nextStudents, { selectRouteStudent = true } = {}) => {
  students.value = Array.isArray(nextStudents) ? nextStudents : []

  readCachedStudentPhotos()

  if (selectedStudent.value) {
    const selectedKey = normalizeStudentMatricula(selectedStudent.value.matricula)
    selectedStudent.value = students.value.find(s => normalizeStudentMatricula(s.matricula) === selectedKey) || selectedStudent.value
  } else if (selectRouteStudent && route.query.q) {
    const match = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(route.query.q))
    if (match) selectStudent(match)
  }
}

const performSearch = async (options = {}) => {
  const { useCache = true, serverQuery } = options || {}
  const requestId = ++studentsRequestId
  const cicloKey = normalizeCicloKey(state.value.ciclo)
  const query = serverQuery === undefined ? (filters.value.q || '') : String(serverQuery || '')

  const cached = useCache ? readCachedStudents({ ciclo: cicloKey, q: query, enrollmentConcepts: externalConcepts.value }) : null
  const cachedConcepts = normalizeEnrollmentConceptIds(cached?.enrollmentConcepts)

  if (!externalConcepts.value.length && cachedConcepts.length) {
    externalConcepts.value = cachedConcepts
    cacheEnrollmentConcepts(cachedConcepts)
  }

  const hasCachedStudents = Boolean(cached?.students?.length)
  const hadStudents = students.value.length > 0

  if (hasCachedStudents) {
    applyStudentsList(cached.students)
    loading.value = false
    setStudentsSyncState({
      status: 'cached',
      message: 'Mostrando alumnos desde caché local.',
      lastUpdatedAt: cached.savedAt,
      recordCount: cached.count,
      hasCache: true,
      error: null
    })
  } else if (!hadStudents) {
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

  try {
    const res = await $fetch('/api/students', { params: { ciclo: cicloKey, q: query, concepts: externalConcepts.value.join(',') } })
    if (requestId !== studentsRequestId) return

    const freshStudents = Array.isArray(res) ? res : []
    applyStudentsList(freshStudents)
    const cacheWritten = writeCachedStudents({ ciclo: cicloKey, q: query, enrollmentConcepts: externalConcepts.value }, freshStudents)
    const updatedAt = new Date().toISOString()

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
    if (requestId === studentsRequestId) loading.value = false
  }
}

const refreshStudentsFromServer = () => performSearch({ useCache: false, serverQuery: '' })
const refreshStudentsAndKpis = () => {
  refreshStudentsFromServer()
  loadGlobalKpis()
  loadKpiSparklines()
}

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
const resolveStudentTipoIngreso = (student) => resolveTipoIngreso(student, currentCicloKey.value, { enrollmentConcepts: externalConcepts.value })

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
  if (selectedStudent.value && !selectedStillLoaded) selectedStudent.value = null
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
      Tutor: s.padre || s['Nombre del padre o tutor'] || '',
      Telefono: s.telefono || '',
      Correo: s.correo || '',
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
    scheduleWorkspaceScaleUpdate()
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
  scheduleWorkspaceScaleUpdate()
}

const openBulkIngresoCycleFlow = () => {
  if (!selectedCount.value) return
  selectedStudent.value = null
  bulkIngresoResult.value = null
  showBulkIngresoCycleModal.value = true
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

    await refreshStudentsFromServer()
    loadGlobalKpis()
    loadKpiSparklines()
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
  pendingBajaStudent.value = student
}

const confirmBaja = async (motivo) => {
  const student = pendingBajaStudent.value
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
        performSearch({ useCache: false })
      },
      { pending: 'Procesando baja...', success: 'Alumno dado de baja exitosamente', error: 'Fallo al procesar baja' }
    )
    pendingBajaStudent.value = null
    await performSearch({ useCache: false })
    loadGlobalKpis()
    loadKpiSparklines()
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

const openStudentOperatorInfo = (student) => {
  if (!canOpenStudentOperatorInfo.value) return
  operatorInfoStudent.value = student
}

const showStudentMenu = (event, student) => {
  const selectedActionLabel = selectedCount.value > 1 && isStudentSelected(student)
    ? `Asignar sección a ${selectedCount.value}`
    : 'Asignar seccion'

  const actions = [
    { label: 'Ver detalles', icon: LucideEye, action: () => selectStudent(student) }
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

const loadEnrollmentConfig = async ({ refreshStudents = false } = {}) => {
  const previousConcepts = externalConcepts.value.join('|')

  try {
    const configData = await $fetch('https://matricula.casitaapps.com/api/enrollment-config/all')
    parseEnrollmentConfig(configData)
  } catch (e) {
    console.warn('Fallback al carecer de configuración externa.')
  }

  const nextConcepts = externalConcepts.value.join('|')
  loadGlobalKpis()
  loadKpiSparklines()

  if (refreshStudents && nextConcepts && nextConcepts !== previousConcepts) {
    performSearch({ useCache: false })
  }
}

onMounted(() => {
  if (route.query.q) filters.value.q = String(route.query.q)
  hydrateCachedEnrollmentConcepts()
  loadCustomSections()
  performSearch({ useCache: true })
  loadEnrollmentConfig({ refreshStudents: true })
})


watch(selectedStudent, scheduleWorkspaceScaleUpdate)

watch(selectedCount, (count) => {
  if (count <= 1 && bulkWorkspaceMode.value !== 'none') bulkWorkspaceMode.value = 'none'
  if (count > 1 && bulkWorkspaceMode.value === 'none') {
    selectedStudent.value = null
    bulkWorkspaceMode.value = 'bulk'
  }
  if (bulkWorkspaceMode.value === 'bulk-payment') loadBulkPaymentDebts()
  scheduleWorkspaceScaleUpdate()
})

watch(() => selectedStudents.value.map(student => student.matricula).join('|'), () => {
  if (bulkWorkspaceMode.value === 'bulk-payment') loadBulkPaymentDebts()
})

watch(bulkWorkspaceMode, scheduleWorkspaceScaleUpdate)


watch(activeFilter, (nextFilter) => {
  const normalizedFilter = normalizeDashboardFilter(nextFilter)
  if (nextFilter !== normalizedFilter) activeFilter.value = normalizedFilter
})

watch(
  () => [currentCicloKey.value, externalConcepts.value.join('|'), students.value.length],
  () => {
    if (!activeFilter.value) activeFilter.value = DEFAULT_KPI_FILTER
  },
  { flush: 'post' }
)

watch(
  () => ({
    status: studentsSyncState.value.status,
    hasCache: studentsSyncState.value.hasCache,
    count: students.value.length
  }),
  ({ status, hasCache, count }) => {
    if (status === 'syncing' && hasCache && count > 0) {
      startKpiRefresh()
    } else {
      stopKpiRefresh()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearKpiRefreshTimer()
})

watch(() => state.value.ciclo, () => {
  performSearch({ useCache: true })
  loadGlobalKpis()
  loadKpiSparklines()
})

const openAlta = () => { editingStudent.value = null; showStudentModal.value = true }
const openEdit = (studentData) => { editingStudent.value = studentData; showStudentModal.value = true }
const closeStudentModal = () => { showStudentModal.value = false; editingStudent.value = null }

const handleStudentSuccess = () => {
  closeStudentModal()
  refreshStudentsFromServer()
  loadGlobalKpis()
  loadKpiSparklines()
}
</script>
