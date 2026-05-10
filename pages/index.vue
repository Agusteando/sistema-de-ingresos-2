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
      @set-filter="setActiveFilter"
    />

    <StudentsFilterBar
      :search-query="filters.q"
      :active-grado="activeGrado"
      :active-grupo="activeGrupo"
      :active-saldo-filter="activeSaldoFilter"
      :available-grados="availableGrados"
      :available-grupos="availableGrupos"
      @update-search-query="filters.q = $event"
      @update-active-grado="activeGrado = $event"
      @update-active-grupo="activeGrupo = $event"
      @update-active-saldo-filter="activeSaldoFilter = $event"
      @toggle-debt="toggleSaldoDebtFilter"
      @search="performSearch"
      @export="exportData"
    />

    <StudentsActiveFilterStrip
      v-if="selectedFilterTags.length"
      :tags="selectedFilterTags"
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
            @open-section-selection="openSectionModalForSelection"
            @clear-filters="clearFilters"
            @toggle-displayed-selection="toggleDisplayedSelection"
            @toggle-student-selection="toggleStudentSelection"
            @student-row-click="handleStudentRowClick"
            @select-student="selectStudent"
            @show-student-menu="showStudentMenu"
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
            @refresh="performSearch"
            @edit="openEdit"
            @close-detail="selectedStudent = null"
            @switch-student="selectStudentByMatricula"
            @photo-loaded="cacheStudentPhoto"
            @baja="bajaAlumno"
            @manage-sections="openSectionModal"
            @close-bulk="closeBulkWorkspace"
            @open-bulk-payment="openBulkPaymentFlow"
            @open-section-selection="openSectionModalForSelection"
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
      @open-bulk-payment="openBulkPaymentFlow"
      @clear-selected="clearSelectedStudents"
    />

    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
    <BajaReasonModal v-if="pendingBajaStudent" :student="pendingBajaStudent" @close="pendingBajaStudent = null" @confirm="confirmBaja" />

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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { useHead } from '#imports'
import { LucideEye, LucideSettings, LucideTag, LucideTags, LucideUserX } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { useStudentsWorkspaceScale } from '~/composables/useStudentsWorkspaceScale'
import { useStudentSelection } from '~/composables/useStudentSelection'
import { useStudentSections } from '~/composables/useStudentSections'
import { useStudentBulkPayments } from '~/composables/useStudentBulkPayments'
import { exportToCSV } from '~/utils/export'
import { GRADOS_ORDEN } from '~/utils/constants'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import {
  formatMoney,
  gradeVisualTitle,
  isSectionFilter,
  isStudentEnrolled,
  normalizeStudentMatricula,
  parseEnrollmentConcepts,
  photoStorageKey,
  sectionIdFromFilter,
  studentGroupLabel,
  studentHasSection
} from '~/shared/utils/studentPresentation'
import StudentsHero from '~/components/students/StudentsHero.vue'
import StudentsKpiSummary from '~/components/students/StudentsKpiSummary.vue'
import StudentsFilterBar from '~/components/students/StudentsFilterBar.vue'
import StudentsActiveFilterStrip from '~/components/students/StudentsActiveFilterStrip.vue'
import StudentsListPanel from '~/components/students/StudentsListPanel.vue'
import StudentsWorkspacePanel from '~/components/students/StudentsWorkspacePanel.vue'
import StudentsSelectionDock from '~/components/students/StudentsSelectionDock.vue'
import StudentSectionModal from '~/components/students/StudentSectionModal.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'
import BajaReasonModal from '~/components/BajaReasonModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const route = useRoute()
useHead({ bodyAttrs: { class: 'students-route-active' } })
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')

const filters = ref({ q: '' })
const activeFilter = ref('inscritos')
const activeGrado = ref('')
const activeGrupo = ref('')
const activeSaldoFilter = ref('all')

const externalConcepts = ref(['inscripcion', 'inscripción', 'reinscripción', 'reinscripcion'])

const students = ref([])
const loading = ref(false)
const selectedStudent = ref(null)
const photoCache = ref({})

const globalKpis = ref({ ingresosMes: 0 })
const showStudentModal = ref(false)
const editingStudent = ref(null)
const pendingBajaStudent = ref(null)
const bulkWorkspaceMode = ref('none')
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
  refreshStudents: () => performSearch(),
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

const hasActiveFilters = computed(() => Boolean(
  activeFilter.value ||
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

const selectedFilterTags = computed(() => {
  const tags = []
  if (activeFilter.value && activeFilter.value !== 'inscritos') tags.push(activeFilterLabel.value)
  if (activeGrado.value) tags.push(`Grado: ${activeGrado.value}`)
  if (activeGrupo.value) tags.push(`Grupo: ${activeGrupo.value}`)
  if (filters.value.q) tags.push(`Busqueda: ${filters.value.q}`)
  return tags
})

const setActiveFilter = (filter) => {
  activeFilter.value = activeFilter.value === filter ? '' : filter
  activeGrado.value = ''
  activeGrupo.value = ''
}

const toggleSaldoDebtFilter = () => {
  activeSaldoFilter.value = activeSaldoFilter.value === 'debt' ? 'all' : 'debt'
}

const clearFilters = () => {
  filters.value.q = ''
  activeFilter.value = ''
  activeGrado.value = ''
  activeGrupo.value = ''
  activeSaldoFilter.value = 'all'
  performSearch()
}


const parseEnrollmentConfig = (obj) => {
  const concepts = parseEnrollmentConcepts(obj)
  if (concepts.length > 0) externalConcepts.value = concepts
}

const loadGlobalKpis = async () => {
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch('/api/dashboard/kpis', { params: { ciclo: cicloKey } })
    globalKpis.value.ingresosMes = res.ingresosMes || 0
  } catch(e) {}
}

const performSearch = async () => {
  loading.value = true
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    if (filters.value.q && activeFilter.value === 'inscritos') activeFilter.value = ''
    const res = await $fetch('/api/students', { params: { ciclo: cicloKey, q: filters.value.q } })
    students.value = res || []
    const knownMatriculas = new Set(students.value.map(student => normalizeStudentMatricula(student.matricula)))
    setSelectedMatriculas(Array.from(selectedMatriculas.value).filter(matricula => knownMatriculas.has(matricula)))
    readCachedStudentPhotos()

    if (selectedStudent.value) {
      selectedStudent.value = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(selectedStudent.value.matricula)) || null
    } else if (route.query.q) {
      const match = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(route.query.q))
      if (match) selectStudent(match)
    }
  } catch (e) {
    show('Error al cargar la base de datos', 'danger')
  } finally {
    loading.value = false
  }
}

const isEnrolled = (student) => isStudentEnrolled(student, externalConcepts.value)

const kpiCounts = computed(() => {
  let inscritos = 0, internos = 0, externos = 0, no_inscritos = 0, bajas = 0
  students.value.forEach(s => {
    if (s.estatus !== 'Activo') {
      bajas++
    } else if (isEnrolled(s)) {
      inscritos++
      if (String(s.interno) === '1') internos++
      else externos++
    } else {
      no_inscritos++
    }
  })
  return { inscritos, internos, externos, no_inscritos, bajas }
})

const studentMatchesActiveFilter = (student) => {
  if (activeFilter.value === 'inscritos') return isEnrolled(student)
  if (activeFilter.value === 'internos') return isEnrolled(student) && String(student.interno) === '1'
  if (activeFilter.value === 'externos') return isEnrolled(student) && String(student.interno) === '0'
  if (activeFilter.value === 'no_inscritos') return student.estatus === 'Activo' && !isEnrolled(student)
  if (activeFilter.value === 'bajas') return student.estatus !== 'Activo'
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

watch(displayedStudents, (list) => {
  if (!list.length) {
    selectedStudent.value = null
    return
  }

  const selectedKey = normalizeStudentMatricula(selectedStudent.value?.matricula)
  const selectedStillVisible = selectedKey && list.some(student => normalizeStudentMatricula(student.matricula) === selectedKey)
  if (selectedStudent.value && !selectedStillVisible) selectedStudent.value = null
}, { flush: 'post' })


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

const exportData = () => {
  const exportList = displayedStudents.value.map(s => ({
    Matrícula: s.matricula,
    Nombre: s.nombreCompleto,
    Tipo: String(s.interno) === '1' ? 'Interno' : 'Externo',
    Nivel: s.nivel,
    Grado: s.grado,
    Grupo: s.grupo,
    Cargos_MXN: Number(s.importeTotal).toFixed(2),
    Pagos_MXN: Number(s.pagosTotal).toFixed(2),
    Saldo_MXN: Number(s.saldoNeto).toFixed(2),
    Estatus: s.estatus,
    Secciones: (s.customSections || []).map(section => section.name).join(' | ')
  }))
  exportToCSV(`Alumnos_${normalizeCicloKey(state.value.ciclo)}.csv`, exportList)
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
        performSearch()
      },
      { pending: 'Procesando baja...', success: 'Alumno dado de baja exitosamente', error: 'Fallo al procesar baja' }
    )
    pendingBajaStudent.value = null
  } catch (e) {}
}

const showStudentMenu = (event, student) => {
  const selectedActionLabel = selectedCount.value > 1 && isStudentSelected(student)
    ? `Asignar sección a ${selectedCount.value}`
    : 'Asignar seccion'

  openMenu(event, [
    { label: 'Ver detalles', icon: LucideEye, action: () => selectStudent(student) },
    { label: '-' },
    { label: 'Editar alumno', icon: LucideSettings, action: () => openEdit(student) },
    { label: selectedActionLabel, icon: LucideTags, action: () => (selectedCount.value > 1 && isStudentSelected(student) ? openSectionModalForSelection() : openSectionModal(student)) },
    { label: isStudentSelected(student) ? 'Quitar de selección' : 'Seleccionar', icon: LucideTag, action: () => toggleStudentSelection(student) },
    { label: '-' },
    { label: 'Dar de baja', icon: LucideUserX, class: 'text-accent-coral font-bold', disabled: student.estatus !== 'Activo', action: () => bajaAlumno(student) }
  ])
}

onMounted(async () => {
  try {
    const configData = await $fetch('https://matricula.casitaapps.com/api/enrollment-config/all')
    parseEnrollmentConfig(configData)
  } catch (e) {
    console.warn('Fallback al carecer de configuración externa.')
  }

  if (route.query.q) filters.value.q = String(route.query.q)
  loadCustomSections()
  performSearch()
  loadGlobalKpis()
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

watch(() => state.value.ciclo, () => {
  performSearch()
  loadGlobalKpis()
})

const openAlta = () => { editingStudent.value = null; showStudentModal.value = true }
const openEdit = (studentData) => { editingStudent.value = studentData; showStudentModal.value = true }
const closeStudentModal = () => { showStudentModal.value = false; editingStudent.value = null }

const handleStudentSuccess = () => {
  closeStudentModal()
  performSearch()
  loadGlobalKpis()
}
</script>
