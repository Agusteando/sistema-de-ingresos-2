<template>
  <div class="students-screen control-escolar-screen">
    <header class="students-hero ce-hero">
      <div class="hero-copy">
        <h1>Control Escolar</h1>
        <p>Consulta y actualización ligera de datos escolares. La lista nace de <strong>base</strong> y los datos editables se guardan en <strong>matricula</strong>.</p>
      </div>
      <div class="hero-actions ce-hero-actions">
        <div class="ce-selected-plantel" :class="{ empty: !selectedAgentId }">
          <span>Plantel activo</span>
          <strong>{{ selectedAgentId || 'Selecciona' }}</strong>
        </div>
        <UiButton variant="secondary" :disabled="loadingAny || !selectedAgentId" @click="refreshAll">
          <LucideRefreshCw :size="18" :class="{ spinning: loadingAny }" /> Actualizar
        </UiButton>
        <UiButton variant="primary" :disabled="!selectedAgentId || !students.length" @click="exportCurrentView">
          <LucideDownload :size="18" /> Exportar
        </UiButton>
      </div>
    </header>

    <section class="ce-plantel-rail" aria-label="Selector de plantel">
      <button
        v-for="plantel in planteles"
        :key="plantel.agentId"
        type="button"
        :class="['ce-plantel-chip', { active: selectedAgentId === plantel.agentId }]"
        @click="selectPlantel(plantel.agentId)"
      >
        <span>{{ plantel.label }}</span>
        <small>{{ selectedAgentId === plantel.agentId ? 'En vista' : 'Cambiar' }}</small>
      </button>
      <span v-if="optionsLoading" class="ce-rail-hint">Cargando planteles…</span>
      <span v-else-if="!planteles.length" class="ce-rail-hint">No hay planteles disponibles para esta sesión.</span>
    </section>

    <section :class="['kpi-summary-system ce-kpi-system', { 'is-refreshing': kpisLoading }]" aria-label="Indicadores de Control Escolar">
      <div class="kpi-strip ce-kpi-strip">
        <button
          v-for="item in kpiCards"
          :key="item.key"
          type="button"
          :class="['kpi-card', item.tone, { active: activeQuickFilter === item.key }]"
          @click="applyKpiFilter(item.key)"
        >
          <span class="kpi-icon"><component :is="item.icon" :size="24" /></span>
          <span class="kpi-text">
            <span>{{ item.label }}</span>
            <strong>{{ formatNumber(item.value) }}</strong>
          </span>
          <UiKpiSparkline :values="item.sparkline" />
        </button>
      </div>
      <div v-if="kpis?.porNivel?.length" class="section-kpi-rail ce-program-rail" aria-label="Niveles">
        <button
          v-for="nivel in kpis.porNivel"
          :key="nivel.label"
          type="button"
          :class="['section-kpi-card', { active: filters.nivel === nivel.label }]"
          @click="filters.nivel = filters.nivel === nivel.label ? '' : nivel.label"
        >
          <span class="section-kpi-name">{{ nivel.label }}</span>
          <strong>{{ nivel.total }}</strong>
        </button>
      </div>
    </section>

    <div class="filter-bar ce-filter-bar">
      <div class="search-control" :class="{ 'has-filter-token': activeFilterLabel }">
        <span class="search-filter-icon" aria-hidden="true"><LucideFilter :size="15" /></span>
        <button v-if="activeFilterLabel" type="button" class="search-filter-token" @click="clearFilters">
          <span>{{ activeFilterLabel }}</span><b aria-hidden="true">×</b>
        </button>
        <LucideSearch class="search-icon" :size="18" />
        <input v-model="filters.search" placeholder="Matrícula, nombre, CURP, teléfono o correo…" @keyup.enter="loadStudents" />
      </div>

      <div class="grade-filter ce-filter-stack">
        <div class="grade-tabs" aria-label="Filtros principales">
          <UiChip :active="!filters.status && !filters.missing" @click="clearQuickFilters">Todos</UiChip>
          <UiChip :active="filters.status === 'active'" @click="toggleFilter('status', 'active')">Activos</UiChip>
          <UiChip :active="filters.status === 'baja'" @click="toggleFilter('status', 'baja')">Bajas</UiChip>
          <UiChip :active="filters.missing === 'overlay'" @click="toggleFilter('missing', 'overlay')">Sin ficha matricula</UiChip>
          <UiChip :active="filters.missing === 'curp'" @click="toggleFilter('missing', 'curp')">Sin CURP</UiChip>
          <UiChip :active="filters.missing === 'phone'" @click="toggleFilter('missing', 'phone')">Sin teléfono</UiChip>
          <UiChip :active="filters.missing === 'guardian'" @click="toggleFilter('missing', 'guardian')">Sin tutor</UiChip>
        </div>
        <div class="group-tabs" aria-label="Filtros académicos">
          <UiChip v-for="nivel in catalogs.niveles" :key="`nivel-${nivel}`" :active-group="filters.nivel === nivel" @click="toggleFilter('nivel', nivel)">{{ nivel }}</UiChip>
          <UiChip v-for="grado in catalogs.grados" :key="`grado-${grado}`" :active-group="filters.grado === grado" @click="toggleFilter('grado', grado)">{{ grado }}</UiChip>
          <UiChip v-for="grupo in catalogs.grupos" :key="`grupo-${grupo}`" :active-group="filters.group === grupo" @click="toggleFilter('group', grupo)">Grupo {{ grupo }}</UiChip>
        </div>
      </div>

      <UiButton variant="secondary" class="export-button" :disabled="!hasActiveFilters" @click="clearFilters">
        <LucideRotateCcw :size="18" /> Limpiar
      </UiButton>
    </div>

    <div ref="studentsScaleShell" class="students-scale-shell" :style="studentsScaleShellStyle">
      <div class="students-design-canvas" :style="studentsDesignCanvasStyle">
        <div :class="['students-workspace ce-workspace', { 'has-detail': Boolean(selectedStudent) }]">
          <section :class="['student-list-panel', selectedStudent ? 'is-compact' : 'is-full']">
            <div class="student-list-card ce-list-card">
              <div class="list-titlebar ce-list-titlebar">
                <div class="list-heading-copy">
                  <h2>Alumnos <span>{{ pagination.total }}</span></h2>
                  <p>{{ selectedAgentId ? `Plantel ${selectedAgentId}` : 'Sin plantel seleccionado' }}</p>
                </div>
                <div class="ce-pagination-mini">
                  <button type="button" :disabled="pagination.page <= 1 || studentsLoading" @click="goToPage(pagination.page - 1)"><LucideChevronLeft :size="16" /></button>
                  <span>{{ pagination.page }} / {{ pagination.pages }}</span>
                  <button type="button" :disabled="pagination.page >= pagination.pages || studentsLoading" @click="goToPage(pagination.page + 1)"><LucideChevronRight :size="16" /></button>
                </div>
              </div>

              <div :class="['list-columns ce-list-columns', selectedStudent ? 'compact' : 'full']">
                <span>Alumno</span>
                <span>Perfil escolar</span>
                <span>Calidad de datos</span>
                <span></span>
              </div>

              <div class="student-list-scroll ce-list-scroll">
                <div v-if="!selectedAgentId" class="empty-state ce-state-card">
                  <LucideBuilding2 :size="24" /> Selecciona un plantel para iniciar Control Escolar.
                </div>
                <div v-else-if="studentsLoading" class="ce-skeleton-stack" aria-live="polite">
                  <span v-for="i in 6" :key="i" class="ce-skeleton-row"></span>
                </div>
                <div v-else-if="loadError" class="empty-state ce-state-card error">
                  <LucideWifiOff :size="24" /> {{ loadError }}
                </div>
                <div v-else-if="!students.length" class="empty-state ce-state-card">
                  <LucideSearchX :size="24" /> No hay alumnos con los filtros actuales.
                  <button v-if="hasActiveFilters" type="button" class="ce-inline-action" @click="clearFilters">Limpiar filtros</button>
                </div>

                <template v-else>
                  <button
                    v-for="student in students"
                    :key="student.matricula"
                    type="button"
                    :class="['student-row ce-student-row', { selected: selectedStudent?.matricula === student.matricula, 'missing-overlay': !student.overlayExists }]"
                    :style="studentPresentationStyle(student)"
                    @click="selectStudent(student)"
                  >
                    <UiGroupIcon v-if="student.group" class="student-group-watermark" :label="student.group" />
                    <span class="student-identity ce-student-identity">
                      <StudentGradePhotoCard
                        class="student-row-grade-card"
                        :student="student"
                        :photo-url="student.photoUrl"
                        :photo-loading="false"
                        :is-enrolled="student.status === 'Activo'"
                      />
                      <span v-if="student.group" class="student-group-sigil" :title="student.group">
                        <UiGroupIcon :label="student.group" />
                      </span>
                      <span class="student-copy">
                        <strong :title="student.fullName">{{ student.fullName || 'Alumno sin nombre' }}</strong>
                        <em class="student-meta"><span>{{ student.matricula }}</span></em>
                        <span class="student-type-line">
                          <span :class="['student-tipo-chip', student.overlayExists ? 'interno' : 'externo']">
                            <LucideDatabase :size="11" /> {{ student.overlayExists ? 'matricula enlazada' : 'crear ficha al editar' }}
                          </span>
                        </span>
                      </span>
                    </span>

                    <span class="ce-profile-cell">
                      <strong>{{ compactAcademic(student) }}</strong>
                      <small>{{ student.program || student.nivel || 'Sin programa' }}</small>
                      <span :class="['ce-status-pill', statusTone(student)]">{{ student.status || 'Activo' }}</span>
                    </span>

                    <span class="ce-quality-cell">
                      <strong>{{ student.missingFields.length ? `${student.missingFields.length} pendientes` : 'Completo' }}</strong>
                      <small>{{ student.missingFields.length ? student.missingFields.join(', ') : 'Sin faltantes principales' }}</small>
                    </span>

                    <span class="row-actions">
                      <span class="ce-row-action"><LucideChevronRight :size="18" /></span>
                    </span>
                  </button>
                </template>
              </div>
            </div>
          </section>

          <section v-if="selectedStudent" class="student-detail-panel ce-detail-panel">
            <div class="ce-detail-shell">
              <header class="ce-detail-header">
                <button type="button" class="detail-shell-close" @click="selectedStudent = null"><LucideX :size="20" /></button>
                <div>
                  <small>{{ selectedStudent.matricula }} · {{ selectedStudent.plantel }}</small>
                  <h2>{{ selectedStudent.fullName || 'Ficha de alumno' }}</h2>
                  <p>{{ selectedStudent.overlayExists ? 'Datos combinados desde base + matricula' : 'No existe fila en matricula; se creará al guardar.' }}</p>
                </div>
                <span :class="['ce-status-pill large', statusTone(selectedStudent)]">{{ selectedStudent.status || 'Activo' }}</span>
              </header>

              <div class="ce-detail-body">
                <section class="ce-profile-card">
                  <StudentGradePhotoCard
                    class="ce-detail-photo"
                    :student="selectedStudent"
                    :photo-url="selectedStudent.photoUrl"
                    :photo-loading="false"
                    :is-enrolled="selectedStudent.status === 'Activo'"
                  />
                  <div class="ce-profile-copy">
                    <strong>{{ selectedStudent.fullName }}</strong>
                    <span>{{ compactAcademic(selectedStudent) }}</span>
                    <p>{{ selectedStudent.guardianName || 'Sin tutor capturado' }}</p>
                  </div>
                </section>

                <section class="ce-data-section">
                  <div class="ce-section-heading">
                    <span><LucideShieldCheck :size="18" /></span>
                    <div>
                      <h3>Calidad del expediente</h3>
                      <p>{{ selectedStudent.missingFields.length ? 'Campos principales pendientes de captura.' : 'Campos principales completos.' }}</p>
                    </div>
                  </div>
                  <div class="ce-missing-grid">
                    <span v-for="field in requiredDataFields" :key="field.key" :class="['ce-missing-chip', { ok: !selectedStudent.missingFields.includes(field.key) && !selectedStudent.missingFields.includes(field.label.toLowerCase()) }]">
                      <component :is="field.icon" :size="14" /> {{ field.label }}
                    </span>
                  </div>
                </section>

                <form class="ce-edit-form" @submit.prevent="saveStudent">
                  <section class="ce-form-card">
                    <div class="ce-section-heading compact">
                      <span><LucideUserRound :size="18" /></span>
                      <h3>Identidad</h3>
                    </div>
                    <div class="ce-form-grid three">
                      <label><span>A. paterno</span><input v-model="editForm.apellidoPaterno" /></label>
                      <label><span>A. materno</span><input v-model="editForm.apellidoMaterno" /></label>
                      <label><span>Nombre(s)</span><input v-model="editForm.nombres" /></label>
                      <label><span>CURP</span><input v-model="editForm.curp" maxlength="18" /></label>
                      <label><span>Interno</span><input v-model="editForm.interno" /></label>
                      <label><span>Servicio</span><input v-model="editForm.servicio" /></label>
                    </div>
                  </section>

                  <section class="ce-form-card">
                    <div class="ce-section-heading compact">
                      <span><LucideGraduationCap :size="18" /></span>
                      <h3>Escolar</h3>
                    </div>
                    <div class="ce-form-grid three">
                      <label><span>Nivel</span><input v-model="editForm.nivel" /></label>
                      <label><span>Grado</span><input v-model="editForm.grado" /></label>
                      <label><span>Grupo</span><input v-model="editForm.grupo" /></label>
                      <label><span>Baja</span><select v-model="editForm.baja"><option :value="0">No</option><option :value="1">Sí</option></select></label>
                      <label><span>Motivo baja</span><input v-model="editForm.motivoBaja" /></label>
                      <label><span>Categoría baja</span><input v-model="editForm.categoriaBaja" /></label>
                    </div>
                    <label class="ce-wide-field"><span>Seguimiento baja</span><textarea v-model="editForm.seguimientoBaja" rows="2"></textarea></label>
                  </section>

                  <section class="ce-form-card">
                    <div class="ce-section-heading compact">
                      <span><LucideUsersRound :size="18" /></span>
                      <h3>Familia y contacto</h3>
                    </div>
                    <div class="ce-form-grid three">
                      <label><span>Nombre padre</span><input v-model="editForm.nombrePadre" /></label>
                      <label><span>A. paterno padre</span><input v-model="editForm.apellidoPaternoPadre" /></label>
                      <label><span>A. materno padre</span><input v-model="editForm.apellidoMaternoPadre" /></label>
                      <label><span>Nombre madre</span><input v-model="editForm.nombreMadre" /></label>
                      <label><span>A. paterno madre</span><input v-model="editForm.apellidoPaternoMadre" /></label>
                      <label><span>A. materno madre</span><input v-model="editForm.apellidoMaternoMadre" /></label>
                      <label><span>Teléfono padre</span><input v-model="editForm.telefonoPadre" /></label>
                      <label><span>Teléfono madre</span><input v-model="editForm.telefonoMadre" /></label>
                      <label><span>Email padre</span><input v-model="editForm.emailPadre" type="email" /></label>
                      <label><span>Email madre</span><input v-model="editForm.emailMadre" type="email" /></label>
                    </div>
                    <label class="ce-wide-field"><span>Dirección</span><textarea v-model="editForm.direccion" rows="2"></textarea></label>
                  </section>

                  <div v-if="saveError" class="ce-save-error"><LucideAlertTriangle :size="16" /> {{ saveError }}</div>

                  <footer class="ce-detail-footer">
                    <span>{{ selectedStudent.overlayExists ? 'Guardar actualiza matricula.' : 'Guardar crea matricula y aplica los cambios.' }}</span>
                    <div>
                      <UiButton variant="secondary" type="button" @click="resetEditForm">Restaurar</UiButton>
                      <UiButton variant="primary" type="submit" :disabled="savingStudent">
                        <LucideSave :size="17" /> {{ savingStudent ? 'Guardando…' : 'Guardar ficha' }}
                      </UiButton>
                    </div>
                  </footer>
                </form>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useHead } from '#imports'
import {
  LucideAlertTriangle,
  LucideBuilding2,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDatabase,
  LucideDownload,
  LucideFilter,
  LucideGraduationCap,
  LucideMail,
  LucidePhone,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch,
  LucideSearchX,
  LucideShieldCheck,
  LucideUserRound,
  LucideUsersRound,
  LucideWifiOff,
  LucideX
} from 'lucide-vue-next'
import UiButton from '~/components/ui/UiButton.vue'
import UiChip from '~/components/ui/UiChip.vue'
import UiGroupIcon from '~/components/ui/UiGroupIcon.vue'
import UiKpiSparkline from '~/components/ui/UiKpiSparkline.vue'
import StudentGradePhotoCard from '~/components/students/StudentGradePhotoCard.vue'
import { useStudentsWorkspaceScale } from '~/composables/useStudentsWorkspaceScale'
import { useToast } from '~/composables/useToast'
import { studentPresentationStyle } from '~/shared/utils/studentPresentation'

useHead({ bodyAttrs: { class: 'students-route-active' } })

const { show } = useToast()
const planteles = ref([])
const selectedAgentId = ref('')
const optionsLoading = ref(false)
const kpisLoading = ref(false)
const studentsLoading = ref(false)
const savingStudent = ref(false)
const loadError = ref('')
const saveError = ref('')
const students = ref([])
const selectedStudent = ref(null)
const kpis = ref(null)
const catalogs = reactive({ niveles: [], grados: [], grupos: [] })
const activeQuickFilter = ref('')
const pagination = reactive({ page: 1, limit: 25, total: 0, pages: 1 })
const filters = reactive({ search: '', status: '', missing: '', nivel: '', grado: '', group: '', recent: '' })
const editForm = reactive({})
let searchTimer = null

const hasDetail = computed(() => Boolean(selectedStudent.value))
const { studentsScaleShell, studentsScaleShellStyle, studentsDesignCanvasStyle, scheduleWorkspaceScaleUpdate } = useStudentsWorkspaceScale(hasDetail)
const loadingAny = computed(() => optionsLoading.value || kpisLoading.value || studentsLoading.value || savingStudent.value)
const hasActiveFilters = computed(() => Object.values(filters).some(Boolean))
const activeFilterLabel = computed(() => {
  const active = []
  if (filters.status) active.push(filters.status === 'active' ? 'Activos' : filters.status === 'baja' ? 'Bajas' : filters.status)
  if (filters.missing) active.push(missingLabel(filters.missing))
  if (filters.nivel) active.push(filters.nivel)
  if (filters.grado) active.push(filters.grado)
  if (filters.group) active.push(`Grupo ${filters.group}`)
  if (filters.search) active.push('Búsqueda')
  return active.slice(0, 2).join(' · ')
})

const kpiCards = computed(() => {
  const data = kpis.value || {}
  return [
    { key: 'total', label: 'Total inscritos', value: data.totalInscritos || 0, tone: 'kpi-green', icon: LucideUsersRound, sparkline: [0, data.totalInscritos || 0, data.totalInscritos || 0] },
    { key: 'active', label: 'Activos', value: data.activos || 0, tone: 'kpi-teal', icon: LucideShieldCheck, sparkline: [0, data.activos || 0, data.activos || 0] },
    { key: 'baja', label: 'Bajas', value: data.bajas || data.inactivos || 0, tone: 'kpi-red', icon: LucideAlertTriangle, sparkline: [0, data.bajas || 0, data.inactivos || 0] },
    { key: 'overlay', label: 'Sin ficha matricula', value: data.nuevosOverlay || 0, tone: 'kpi-blue', icon: LucideDatabase, sparkline: [0, data.nuevosOverlay || 0, data.nuevosOverlay || 0] },
    { key: 'incomplete', label: 'Expedientes incompletos', value: data.expedientesIncompletos || 0, tone: 'kpi-gray', icon: LucideSearchX, sparkline: [0, data.expedientesIncompletos || 0, data.expedientesIncompletos || 0] },
    { key: 'contact', label: 'Sin contacto', value: (data.sinTelefono || 0) + (data.sinTutor || 0), tone: 'kpi-red', icon: LucidePhone, sparkline: [0, data.sinTelefono || 0, data.sinTutor || 0] }
  ]
})

const requiredDataFields = [
  { key: 'curp', label: 'CURP', icon: LucideShieldCheck },
  { key: 'teléfono', label: 'Teléfono', icon: LucidePhone },
  { key: 'email', label: 'Email', icon: LucideMail },
  { key: 'tutor', label: 'Tutor', icon: LucideUsersRound }
]

const formatNumber = (value) => Number(value || 0).toLocaleString('es-MX')
const missingLabel = (value) => ({ curp: 'Sin CURP', phone: 'Sin teléfono', email: 'Sin email', guardian: 'Sin tutor', overlay: 'Sin ficha matricula' }[value] || value)
const compactAcademic = (student) => [student.grado, student.group ? `Grupo ${student.group}` : '', student.nivel].filter(Boolean).join(' · ') || 'Sin datos académicos'
const statusTone = (student) => String(student?.status || '').toLowerCase() === 'baja' ? 'danger' : String(student?.status || '').toLowerCase() === 'activo' ? 'success' : 'neutral'

const buildQuery = (extra = {}) => ({
  agentId: selectedAgentId.value,
  search: filters.search || undefined,
  status: filters.status || undefined,
  missing: filters.missing || undefined,
  nivel: filters.nivel || undefined,
  grado: filters.grado || undefined,
  group: filters.group || undefined,
  recent: filters.recent || undefined,
  page: pagination.page,
  limit: pagination.limit,
  ...extra
})

const loadOptions = async () => {
  optionsLoading.value = true
  try {
    const response = await $fetch('/api/control-escolar/options')
    planteles.value = response.planteles || []
    selectedAgentId.value = planteles.value.find((p) => p.selected)?.agentId || planteles.value[0]?.agentId || ''
  } catch (error) {
    loadError.value = error?.data?.message || error?.message || 'No se pudieron cargar los planteles.'
  } finally {
    optionsLoading.value = false
  }
}

const loadKpis = async () => {
  if (!selectedAgentId.value) return
  kpisLoading.value = true
  try {
    const response = await $fetch('/api/control-escolar/kpis', { query: { agentId: selectedAgentId.value } })
    kpis.value = response.kpis
  } catch (error) {
    loadError.value = error?.data?.message || error?.message || 'No se pudieron cargar los indicadores.'
  } finally {
    kpisLoading.value = false
  }
}

const loadStudents = async () => {
  if (!selectedAgentId.value) return
  studentsLoading.value = true
  loadError.value = ''
  try {
    const response = await $fetch('/api/control-escolar/students', { query: buildQuery() })
    students.value = response.data || []
    Object.assign(pagination, response.pagination || {})
    Object.assign(catalogs, response.catalogs || { niveles: [], grados: [], grupos: [] })
    if (selectedStudent.value) {
      const refreshed = students.value.find((student) => student.matricula === selectedStudent.value.matricula)
      if (refreshed) selectStudent(refreshed, false)
    }
  } catch (error) {
    students.value = []
    loadError.value = error?.data?.message || error?.message || 'Plantel fuera de línea o sin respuesta.'
  } finally {
    studentsLoading.value = false
    nextTick(scheduleWorkspaceScaleUpdate)
  }
}

const refreshAll = async () => {
  await Promise.all([loadKpis(), loadStudents()])
}

const selectPlantel = async (agentId) => {
  if (selectedAgentId.value === agentId) return
  selectedAgentId.value = agentId
  selectedStudent.value = null
  pagination.page = 1
  await refreshAll()
}

const clearQuickFilters = () => {
  filters.status = ''
  filters.missing = ''
  activeQuickFilter.value = ''
}

const toggleFilter = (key, value) => {
  filters[key] = filters[key] === value ? '' : value
  pagination.page = 1
}

const clearFilters = () => {
  Object.assign(filters, { search: '', status: '', missing: '', nivel: '', grado: '', group: '', recent: '' })
  activeQuickFilter.value = ''
  pagination.page = 1
}

const applyKpiFilter = (key) => {
  activeQuickFilter.value = activeQuickFilter.value === key ? '' : key
  filters.status = ''
  filters.missing = ''
  if (activeQuickFilter.value === 'active') filters.status = 'active'
  if (activeQuickFilter.value === 'baja') filters.status = 'baja'
  if (activeQuickFilter.value === 'overlay') filters.missing = 'overlay'
  if (activeQuickFilter.value === 'incomplete') filters.missing = 'curp'
  if (activeQuickFilter.value === 'contact') filters.missing = 'phone'
  pagination.page = 1
}

const goToPage = (page) => {
  pagination.page = Math.min(Math.max(1, page), pagination.pages || 1)
}

const selectStudent = (student, copy = true) => {
  selectedStudent.value = student
  if (copy) resetEditForm(student)
  nextTick(scheduleWorkspaceScaleUpdate)
}

const resetEditForm = (student = selectedStudent.value) => {
  if (!student) return
  Object.assign(editForm, {
    nombres: student.nombres || '',
    apellidoPaterno: student.apellidoPaterno || '',
    apellidoMaterno: student.apellidoMaterno || '',
    curp: student.curp || '',
    interno: student.interno || '',
    servicio: student.servicio || '',
    nivel: student.nivel || '',
    grado: student.grado || '',
    grupo: student.group || '',
    baja: Number(student.baja || 0),
    motivoBaja: student.motivoBaja || '',
    categoriaBaja: student.categoriaBaja || '',
    seguimientoBaja: student.seguimientoBaja || '',
    nombrePadre: student.nombrePadre || '',
    apellidoPaternoPadre: student.apellidoPaternoPadre || '',
    apellidoMaternoPadre: student.apellidoMaternoPadre || '',
    nombreMadre: student.nombreMadre || '',
    apellidoPaternoMadre: student.apellidoPaternoMadre || '',
    apellidoMaternoMadre: student.apellidoMaternoMadre || '',
    telefonoPadre: student.telefonoPadre || '',
    telefonoMadre: student.telefonoMadre || '',
    emailPadre: student.emailPadre || '',
    emailMadre: student.emailMadre || '',
    direccion: student.address || ''
  })
  saveError.value = ''
}

const saveStudent = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return
  savingStudent.value = true
  saveError.value = ''
  try {
    const payload = { ...editForm }
    const response = await $fetch(`/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}`, {
      method: 'PATCH',
      query: { agentId: selectedAgentId.value },
      body: payload
    })
    if (response.student) {
      const index = students.value.findIndex((student) => student.matricula === response.student.matricula)
      if (index >= 0) students.value[index] = response.student
      selectStudent(response.student)
    }
    show('Ficha de Control Escolar guardada en matricula.', 'success')
    await loadKpis()
  } catch (error) {
    saveError.value = error?.data?.message || error?.message || 'No se pudo guardar la ficha.'
  } finally {
    savingStudent.value = false
  }
}

const exportCurrentView = () => {
  if (!selectedAgentId.value) return
  const params = new URLSearchParams()
  Object.entries(buildQuery({ page: undefined, limit: undefined })).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  window.open(`/api/control-escolar/export?${params.toString()}`, '_blank')
}

watch(() => ({ ...filters }), () => {
  pagination.page = 1
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(loadStudents, 320)
}, { deep: true })

watch(() => pagination.page, () => loadStudents())
watch(selectedAgentId, () => nextTick(scheduleWorkspaceScaleUpdate))

onMounted(async () => {
  await loadOptions()
  if (selectedAgentId.value) await refreshAll()
})
</script>

<style scoped>
.control-escolar-screen { gap: 0; }
.ce-hero strong { font-weight: 850; }
.ce-hero-actions { align-items: stretch; }
.ce-selected-plantel {
  display: flex;
  min-width: 126px;
  flex-direction: column;
  justify-content: center;
  padding: 6px 12px;
  border: 1px solid rgba(63, 145, 56, .2);
  border-radius: 12px;
  background: linear-gradient(180deg, #fff, #f5fbf3);
  box-shadow: var(--students-shadow-soft);
}
.ce-selected-plantel span { color: #6b758f; font-size: 9.8px; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
.ce-selected-plantel strong { color: #2f7f32; font-size: 18px; line-height: 1; }
.ce-selected-plantel.empty strong { color: #7a849a; font-size: 13px; }
.spinning { animation: ce-spin 900ms linear infinite; }
@keyframes ce-spin { to { transform: rotate(360deg); } }

.ce-plantel-rail {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  margin-bottom: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.ce-plantel-rail::-webkit-scrollbar { display: none; }
.ce-plantel-chip {
  display: inline-flex;
  min-width: 76px;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--students-border);
  border-radius: 10px;
  background: #fff;
  color: #42506a;
  box-shadow: 0 6px 14px rgba(21,35,60,.04);
  cursor: pointer;
}
.ce-plantel-chip span { font-size: 12px; font-weight: 870; }
.ce-plantel-chip small { color: #7c879d; font-size: 9.5px; font-weight: 760; }
.ce-plantel-chip.active {
  border-color: transparent;
  background: linear-gradient(180deg, #58a94b 0%, #348b36 100%);
  color: #fff;
  box-shadow: 0 8px 16px rgba(48,132,47,.19);
}
.ce-plantel-chip.active small { color: rgba(255,255,255,.78); }
.ce-rail-hint { color: #6f7b95; font-size: 12px; font-weight: 650; }

.ce-kpi-strip { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.ce-program-rail .section-kpi-card.active { border-color: rgba(63,145,56,.4); background: #eef8eb; }
.ce-filter-bar { grid-template-columns: minmax(360px, 480px) minmax(0, 1fr) auto; }
.ce-filter-stack { gap: 7px; }

.ce-workspace.has-detail { grid-template-columns: minmax(660px, .98fr) minmax(640px, 1fr); }
.ce-list-card {
  --student-list-balance-col: clamp(170px, 14vw, 212px);
  --student-list-quality-col: clamp(158px, 13vw, 198px);
  --student-list-action-col: clamp(50px, 4vw, 58px);
  grid-template-rows: clamp(42px, 3vw, 48px) clamp(44px, 3.2vw, 50px) minmax(0, 1fr);
}
.ce-list-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--students-border-soft);
}
.ce-list-titlebar h2 { margin: 0; color: #15233c; font-size: 15px; font-weight: 850; letter-spacing: -.02em; }
.ce-list-titlebar h2 span { color: #2f7f32; }
.ce-list-titlebar p { margin: 2px 0 0; color: #758098; font-size: 10.5px; font-weight: 650; }
.ce-pagination-mini { display: inline-flex; align-items: center; gap: 6px; color: #6f7b95; font-size: 11px; font-weight: 800; }
.ce-pagination-mini button {
  display: inline-flex;
  width: 29px;
  height: 29px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--students-border);
  border-radius: 9px;
  background: #fff;
  color: #5d687f;
}
.ce-pagination-mini button:disabled { opacity: .42; cursor: not-allowed; }
.ce-list-columns {
  grid-template-columns: minmax(0, 1fr) var(--student-list-balance-col) var(--student-list-quality-col) var(--student-list-action-col);
  padding-inline: clamp(24px, 2vw, 30px) clamp(36px, 3vw, 46px);
}
.ce-list-scroll { padding-top: 8px; }
.ce-student-row {
  grid-template-columns: minmax(0, 1fr) var(--student-list-balance-col) var(--student-list-quality-col) var(--student-list-action-col);
}
.ce-student-row.missing-overlay { border-style: dashed; }
.ce-student-identity { grid-template-columns: var(--student-list-grade-size) var(--student-list-crest-size) minmax(0, 1fr); }
.ce-profile-cell,
.ce-quality-cell {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding-right: 12px;
}
.ce-profile-cell strong,
.ce-quality-cell strong { max-width: 100%; overflow: hidden; color: #15233c; font-size: clamp(12px,.9vw,13px); font-weight: 830; text-overflow: ellipsis; white-space: nowrap; }
.ce-profile-cell small,
.ce-quality-cell small { max-width: 100%; overflow: hidden; color: #71809a; font-size: clamp(10px,.75vw,11px); font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.ce-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 850;
}
.ce-status-pill.success { background: #eef8eb; color: #2f7f32; }
.ce-status-pill.danger { background: #fff0ee; color: #c8423b; }
.ce-status-pill.neutral { background: #f2f5f8; color: #657083; }
.ce-status-pill.large { min-height: 28px; padding-inline: 11px; }
.ce-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(34px, 2.75vw, 40px);
  height: clamp(34px, 2.75vw, 40px);
  border: 1px solid var(--students-border);
  border-radius: clamp(11px, .9vw, 13px);
  background: #fff;
  color: #71809a;
  box-shadow: 0 8px 16px rgba(21, 35, 60, .06);
}
.ce-state-card { flex-direction: column; text-align: center; }
.ce-state-card.error { color: #c8423b; }
.ce-inline-action { border: 0; background: transparent; color: #2f7f32; font-weight: 840; }
.ce-skeleton-stack { display: grid; gap: 8px; padding-right: 18px; }
.ce-skeleton-row { height: var(--student-list-row-height); border-radius: 14px; background: linear-gradient(90deg, #f3f6f9, #fff, #f3f6f9); background-size: 220% 100%; animation: ce-loading 1.4s linear infinite; }
@keyframes ce-loading { to { background-position: -220% 0; } }

.ce-detail-panel { display: flex; min-height: 0; }
.ce-detail-shell {
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--students-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(21,35,60,.04);
  overflow: hidden;
}
.ce-detail-header {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--students-border-soft);
  background: linear-gradient(180deg, #fff, #fbfdfb);
}
.ce-detail-header small { color: #6f7b95; font-size: 10.5px; font-weight: 820; text-transform: uppercase; }
.ce-detail-header h2 { margin: 2px 0 0; overflow: hidden; color: #15233c; font-size: 18px; font-weight: 880; letter-spacing: -.03em; text-overflow: ellipsis; white-space: nowrap; }
.ce-detail-header p { margin: 2px 0 0; color: #748098; font-size: 11px; font-weight: 620; }
.ce-detail-body { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 10px; overflow-y: auto; padding: 10px; }
.ce-profile-card,
.ce-data-section,
.ce-form-card {
  border: 1px solid var(--students-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 7px 18px rgba(21,35,60,.035);
}
.ce-profile-card { display: flex; align-items: center; gap: 14px; padding: 12px; background: linear-gradient(135deg, #fff, #f6fbf4); }
.ce-detail-photo { --student-grade-photo-width: 84px; --student-grade-photo-height: 78px; --student-grade-photo-radius: 14px; }
.ce-profile-copy { min-width: 0; }
.ce-profile-copy strong { display: block; overflow: hidden; color: #15233c; font-size: 18px; font-weight: 870; text-overflow: ellipsis; white-space: nowrap; }
.ce-profile-copy span { color: #2f7f32; font-size: 12px; font-weight: 830; }
.ce-profile-copy p { margin: 5px 0 0; color: #6f7b95; font-size: 12px; font-weight: 630; }
.ce-data-section { padding: 12px; }
.ce-section-heading { display: flex; align-items: flex-start; gap: 10px; }
.ce-section-heading.compact { align-items: center; margin-bottom: 10px; }
.ce-section-heading > span {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #eef8eb;
  color: #2f7f32;
}
.ce-section-heading h3 { margin: 0; color: #15233c; font-size: 13px; font-weight: 850; }
.ce-section-heading p { margin: 2px 0 0; color: #71809a; font-size: 11px; font-weight: 620; }
.ce-missing-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ce-missing-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border: 1px solid rgba(200,66,59,.2); border-radius: 999px; background: #fff5f3; color: #c8423b; font-size: 10.5px; font-weight: 820; }
.ce-missing-chip.ok { border-color: rgba(63,145,56,.2); background: #eff8eb; color: #2f7f32; }
.ce-edit-form { display: flex; flex-direction: column; gap: 10px; }
.ce-form-card { padding: 12px; }
.ce-form-grid { display: grid; gap: 10px; }
.ce-form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ce-form-grid label,
.ce-wide-field { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.ce-form-grid span,
.ce-wide-field span { color: #6d7890; font-size: 9.8px; font-weight: 870; letter-spacing: .045em; text-transform: uppercase; }
.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--students-border);
  border-radius: 10px;
  background: #fff;
  color: #15233c;
  font-size: 12px;
  font-weight: 620;
  outline: 0;
  padding: 0 10px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
}
.ce-wide-field { margin-top: 10px; }
.ce-wide-field textarea { min-height: 62px; padding: 9px 10px; resize: vertical; }
.ce-save-error { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid rgba(200,66,59,.2); border-radius: 12px; background: #fff5f3; color: #c8423b; font-size: 12px; font-weight: 760; }
.ce-detail-footer {
  position: sticky;
  bottom: -10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0 0;
  background: linear-gradient(180deg, rgba(255,255,255,.72), #fff 30%);
}
.ce-detail-footer span { color: #6f7b95; font-size: 11px; font-weight: 680; }
.ce-detail-footer div { display: flex; gap: 8px; }

@media (max-width: 1120px) {
  .ce-kpi-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ce-filter-bar { grid-template-columns: 1fr; }
}
@media (max-width: 980px) {
  .ce-workspace,
  .ce-workspace.has-detail { display: flex; flex-direction: column; height: auto; }
  .ce-list-card,
  .ce-detail-panel { height: 660px; }
  .ce-form-grid.three { grid-template-columns: 1fr; }
}
</style>
