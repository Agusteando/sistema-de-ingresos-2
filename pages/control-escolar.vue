<template>
  <div class="students-screen control-escolar-screen">
    <header class="students-hero control-escolar-hero">
      <div class="hero-copy">
        <h1>Control Escolar</h1>
        <p>Vista operativa de alumnos por plantel, sin datos financieros ni cambios al plantel activo del sistema.</p>
      </div>

      <div class="hero-actions control-escolar-actions">
        <div class="ce-selected-plantel" :class="{ muted: !selectedAgentId }">
          <LucideSchool :size="18" />
          <span>{{ selectedAgentId ? `Plantel ${selectedAgentId}` : 'Selecciona plantel' }}</span>
        </div>
        <UiButton variant="secondary" :disabled="!selectedAgentId || refreshing" @click="refreshAll">
          <LucideRefreshCw :size="18" :class="{ 'animate-spin': refreshing }" /> Actualizar
        </UiButton>
        <UiButton variant="secondary" :disabled="!selectedAgentId || exporting || !students.length" @click="exportCurrentView">
          <LucideDownload :size="18" /> {{ exporting ? 'Exportando' : 'Exportar' }}
        </UiButton>
      </div>
    </header>

    <section class="ce-command-bar">
      <div class="ce-plantel-control">
        <label>Plantel</label>
        <div class="ce-select-wrap">
          <LucideBuilding2 :size="18" />
          <select v-model="selectedAgentId" :disabled="optionsLoading || !plantelOptions.length" aria-label="Plantel para Control Escolar">
            <option value="" disabled>Selecciona un plantel</option>
            <option v-for="plantel in plantelOptions" :key="plantel.agentId" :value="plantel.agentId">
              {{ plantel.label || plantel.agentId }}
            </option>
          </select>
          <LucideChevronDown :size="15" />
        </div>
      </div>

      <div class="ce-plantel-rail" aria-label="Cambio rápido de plantel">
        <button
          v-for="plantel in plantelOptions"
          :key="`rail-${plantel.agentId}`"
          type="button"
          :class="['ce-plantel-chip', { active: selectedAgentId === plantel.agentId }]"
          @click="selectedAgentId = plantel.agentId"
        >
          {{ plantel.agentId }}
        </button>
      </div>
    </section>

    <section v-if="bridgeWarning" class="ce-inline-alert warning">
      <LucideAlertTriangle :size="17" />
      <span>{{ bridgeWarning }}</span>
    </section>

    <section :class="['kpi-summary-system control-escolar-kpis', { 'is-refreshing': kpiLoading }]" aria-label="Resumen de Control Escolar">
      <div class="kpi-strip ce-kpi-strip">
        <button
          v-for="item in kpiCards"
          :key="item.key"
          type="button"
          :class="['kpi-card', item.toneClass, { active: item.active }]"
          @click="applyKpiFilter(item)"
        >
          <span class="kpi-icon"><component :is="item.icon" :size="24" /></span>
          <span class="kpi-text">
            <span>{{ item.label }}</span>
            <StudentsKpiValue :value="item.value" />
          </span>
          <UiKpiSparkline :values="item.sparkline" />
        </button>
      </div>

      <div v-if="distributionItems.length" class="section-kpi-rail ce-distribution-rail" aria-label="Distribución escolar">
        <button
          v-for="item in distributionItems"
          :key="`dist-${item.type}-${item.label}`"
          type="button"
          :class="['section-kpi-card', { active: isDistributionActive(item) }]"
          @click="applyDistributionFilter(item)"
        >
          <span class="section-kpi-icon"><component :is="item.icon" :size="14" /></span>
          <span class="section-kpi-name">{{ item.label }}</span>
          <strong>{{ item.total }}</strong>
        </button>
      </div>
    </section>

    <div class="filter-bar ce-filter-bar">
      <div class="search-control" :class="{ 'has-filter-token': activeFilterLabel }">
        <span class="search-filter-icon" aria-hidden="true"><LucideFilter :size="15" /></span>
        <button v-if="activeFilterLabel" type="button" class="search-filter-token" @click="clearKpiFilter">
          <span>{{ activeFilterLabel }}</span><b aria-hidden="true">×</b>
        </button>
        <LucideSearch class="search-icon" :size="18" />
        <input v-model="searchDraft" placeholder="Matrícula, nombre, CURP, teléfono o tutor..." />
      </div>

      <div class="grade-filter ce-filter-set">
        <div class="grade-tabs" aria-label="Filtros escolares">
          <UiChip :active="!hasSecondaryFilters" @click="clearSecondaryFilters">Todos</UiChip>
          <UiChip :active="filters.status === 'active'" @click="setStatusFilter('active')">Activos</UiChip>
          <UiChip :active="filters.status === 'inactive'" @click="setStatusFilter('inactive')">Bajas</UiChip>
          <UiChip :active="filters.missing === 'any'" @click="setMissingFilter('any')">Datos faltantes</UiChip>
          <UiChip :active="filters.missing === 'curp'" @click="setMissingFilter('curp')">Sin CURP</UiChip>
          <UiChip :active="filters.missing === 'phone'" @click="setMissingFilter('phone')">Sin teléfono</UiChip>
          <UiChip :active="filters.missing === 'guardian'" @click="setMissingFilter('guardian')">Sin tutor</UiChip>
          <UiChip v-if="schema.hasUpdatedAt" :active="filters.recentlyUpdated === '30'" @click="filters.recentlyUpdated = filters.recentlyUpdated === '30' ? '' : '30'">Actualizados 30d</UiChip>
        </div>

        <div v-if="availableGradeChips.length || availableGroupChips.length" class="group-tabs" aria-label="Filtros por grado y grupo">
          <UiChip v-for="grado in availableGradeChips" :key="`grado-${grado}`" :active-group="filters.grado === grado" @click="filters.grado = filters.grado === grado ? '' : grado">{{ grado }}</UiChip>
          <UiChip v-for="group in availableGroupChips" :key="`grupo-${group}`" :active-group="filters.group === group" @click="filters.group = filters.group === group ? '' : group">Grupo {{ group }}</UiChip>
        </div>
      </div>

      <UiButton variant="secondary" class="export-button" :disabled="!hasAnyFilters" @click="clearFilters">
        <LucideRotateCcw :size="18" /> Limpiar
      </UiButton>
    </div>

    <div ref="studentsScaleShell" class="students-scale-shell" :style="studentsScaleShellStyle">
      <div class="students-design-canvas" :style="studentsDesignCanvasStyle">
        <div :class="['students-workspace control-escolar-workspace', { 'has-detail': Boolean(selectedStudent) }]">
          <section :class="['student-list-panel', selectedStudent ? 'is-compact' : 'is-full']">
            <div class="student-list-card ce-list-card">
              <div class="ce-list-titlebar">
                <div>
                  <span>Base escolar</span>
                  <h2>Alumnos <strong>{{ total }}</strong></h2>
                </div>
                <div class="ce-list-meta">
                  <span>Página {{ page }} de {{ totalPages }}</span>
                  <span>{{ students.length }} visibles</span>
                </div>
              </div>

              <div :class="['ce-table-head', selectedStudent ? 'compact' : 'full']">
                <span>Alumno</span>
                <span>Contacto</span>
                <span>Estado</span>
                <span>Escolar</span>
                <span>Datos faltantes</span>
                <span></span>
              </div>

              <div class="student-list-scroll ce-table-scroll">
                <div v-if="loading && !students.length" class="empty-state loading-state">
                  <span class="liquid-loader" aria-hidden="true"><i></i><i></i><i></i></span>
                  Cargando alumnos del plantel...
                </div>

                <div v-else-if="errorMessage" class="ce-state-card error">
                  <LucideWifiOff :size="28" />
                  <strong>No se pudo cargar Control Escolar</strong>
                  <p>{{ errorMessage }}</p>
                  <UiButton variant="secondary" @click="refreshAll"><LucideRefreshCw :size="16" /> Reintentar</UiButton>
                </div>

                <div v-else-if="!selectedAgentId" class="ce-state-card muted">
                  <LucideBuilding2 :size="28" />
                  <strong>Selecciona un plantel</strong>
                  <p>Control Escolar consulta un agente a la vez y no cambia el plantel activo del sistema.</p>
                </div>

                <div v-else-if="!students.length" class="ce-state-card muted">
                  <LucideSearchX :size="28" />
                  <strong>Sin alumnos bajo los filtros actuales</strong>
                  <p>Prueba limpiar filtros o buscar por matrícula, nombre, CURP o tutor.</p>
                </div>

                <template v-else>
                  <button
                    v-for="student in students"
                    :key="student.studentId"
                    type="button"
                    :class="['ce-student-row', selectedStudent?.studentId === student.studentId ? 'selected' : '', student.status !== 'Activo' ? 'inactive' : '']"
                    :style="studentPresentationStyle(student)"
                    @click="selectStudent(student)"
                  >
                    <span class="ce-student-main">
                      <span class="ce-grade-badge">{{ gradeVisualNumber(student) }}</span>
                      <span class="ce-student-copy">
                        <strong>{{ student.fullName || 'Sin nombre' }}</strong>
                        <em><span>{{ student.plantel }}</span><i></i><span>{{ student.matricula || student.studentId }}</span></em>
                        <small>{{ student.curp || 'Sin CURP' }}</small>
                      </span>
                    </span>

                    <span class="ce-contact-cell">
                      <strong>{{ student.phone || 'Sin teléfono' }}</strong>
                      <small>{{ student.email || 'Sin correo' }}</small>
                    </span>

                    <span class="ce-status-cell">
                      <b :class="student.status === 'Activo' ? 'active' : 'inactive'">{{ student.status }}</b>
                      <small>{{ student.updatedAt ? formatDate(student.updatedAt) : 'Sin actualización' }}</small>
                    </span>

                    <span class="ce-school-cell">
                      <strong>{{ student.program || student.nivel || 'Sin programa' }}</strong>
                      <small>{{ [student.grado, student.group ? `Grupo ${student.group}` : ''].filter(Boolean).join(' · ') || 'Sin grupo' }}</small>
                    </span>

                    <span class="ce-missing-cell">
                      <template v-if="student.missingFields.length">
                        <b v-for="field in student.missingFields.slice(0, 3)" :key="`${student.studentId}-${field}`">{{ missingLabel(field) }}</b>
                        <b v-if="student.missingFields.length > 3">+{{ student.missingFields.length - 3 }}</b>
                      </template>
                      <small v-else>Completo</small>
                    </span>

                    <span class="row-actions ce-row-actions">
                      <button type="button" title="Ver detalle" @click.stop="selectStudent(student)">
                        <LucideChevronRight :size="18" />
                      </button>
                    </span>
                  </button>
                </template>
              </div>

              <footer class="ce-pagination">
                <div>
                  <strong>{{ total }}</strong>
                  <span>registros en {{ selectedAgentId || 'plantel' }}</span>
                </div>
                <div class="ce-page-actions">
                  <button type="button" :disabled="page <= 1 || loading" @click="page--"><LucideChevronLeft :size="17" /> Anterior</button>
                  <button type="button" :disabled="page >= totalPages || loading" @click="page++">Siguiente <LucideChevronRight :size="17" /></button>
                </div>
              </footer>
            </div>
          </section>

          <Transition name="detail-flow" mode="out-in">
            <section v-if="selectedStudent" :key="selectedStudent.studentId" class="student-detail-panel ce-detail-panel">
              <div class="student-details-shell ce-detail-shell">
                <div class="student-profile-card ce-profile-card" :style="studentPresentationStyle(selectedStudent)">
                  <div class="profile-main">
                    <div class="profile-identity">
                      <StudentGradePhotoCard :student="selectedStudent" :photo-url="''" :photo-loading="false" :is-enrolled="selectedStudent.status === 'Activo'" />
                      <div class="profile-copy">
                        <h2><span>{{ selectedStudent.fullName || 'Sin nombre' }}</span></h2>
                        <p><span>{{ selectedStudent.matricula }}</span><i></i><span>{{ selectedStudent.plantel }}</span><i></i><span>{{ selectedStudent.status }}</span></p>
                      </div>
                    </div>
                    <button type="button" class="detail-shell-close" aria-label="Cerrar detalle" @click="selectedStudent = null"><LucideX :size="20" /></button>
                  </div>

                  <div class="ce-profile-actions">
                    <UiButton v-if="!editing" variant="primary" @click="startEdit"><LucidePencil :size="17" /> Editar datos</UiButton>
                    <UiButton v-if="editing" variant="secondary" @click="cancelEdit"><LucideX :size="17" /> Cancelar</UiButton>
                    <UiButton v-if="editing" variant="primary" :disabled="saving" @click="saveStudent"><LucideSave :size="17" /> {{ saving ? 'Guardando' : 'Guardar' }}</UiButton>
                  </div>
                </div>

                <div v-if="!editing" class="ce-detail-grid">
                  <article class="ce-detail-card wide">
                    <span>Identidad</span>
                    <dl>
                      <div><dt>Nombre completo</dt><dd>{{ selectedStudent.fullName || '—' }}</dd></div>
                      <div><dt>CURP</dt><dd>{{ selectedStudent.curp || '—' }}</dd></div>
                      <div><dt>Fecha de nacimiento</dt><dd>{{ selectedStudent.birthDate || '—' }}</dd></div>
                    </dl>
                  </article>

                  <article class="ce-detail-card">
                    <span>Contacto</span>
                    <dl>
                      <div><dt>Teléfono</dt><dd>{{ selectedStudent.phone || '—' }}</dd></div>
                      <div><dt>Email</dt><dd>{{ selectedStudent.email || '—' }}</dd></div>
                      <div><dt>Dirección</dt><dd>{{ selectedStudent.address || '—' }}</dd></div>
                    </dl>
                  </article>

                  <article class="ce-detail-card">
                    <span>Escolar</span>
                    <dl>
                      <div><dt>Programa / nivel</dt><dd>{{ selectedStudent.program || selectedStudent.nivel || '—' }}</dd></div>
                      <div><dt>Grado / grupo</dt><dd>{{ [selectedStudent.grado, selectedStudent.group].filter(Boolean).join(' · ') || '—' }}</dd></div>
                      <div><dt>Ciclo</dt><dd>{{ selectedStudent.ciclo || '—' }}</dd></div>
                    </dl>
                  </article>

                  <article class="ce-detail-card wide">
                    <span>Tutor / responsable</span>
                    <dl>
                      <div><dt>Nombre</dt><dd>{{ selectedStudent.guardianName || '—' }}</dd></div>
                      <div><dt>Teléfono</dt><dd>{{ selectedStudent.guardianPhone || '—' }}</dd></div>
                      <div><dt>Email</dt><dd>{{ selectedStudent.guardianEmail || '—' }}</dd></div>
                    </dl>
                  </article>

                  <article class="ce-detail-card wide">
                    <span>Datos faltantes</span>
                    <div class="ce-missing-summary">
                      <b v-for="field in selectedStudent.missingFields" :key="`detail-${field}`">{{ missingLabel(field) }}</b>
                      <small v-if="!selectedStudent.missingFields.length">Expediente básico completo</small>
                    </div>
                  </article>
                </div>

                <form v-else class="ce-edit-form" @submit.prevent="saveStudent">
                  <div class="ce-edit-section">
                    <span>Identidad</span>
                    <label>Apellido paterno<input v-model="editForm.apellidoPaterno" class="input-field" /></label>
                    <label>Apellido materno<input v-model="editForm.apellidoMaterno" class="input-field" /></label>
                    <label>Nombres<input v-model="editForm.nombres" class="input-field" /></label>
                    <label>CURP<input v-model="editForm.curp" class="input-field" maxlength="18" /></label>
                  </div>

                  <div class="ce-edit-section">
                    <span>Contacto</span>
                    <label>Teléfono<input v-model="editForm.phone" class="input-field" /></label>
                    <label>Email<input v-model="editForm.email" class="input-field" type="email" /></label>
                    <label v-if="schema.editableFields.address" class="wide">Dirección<input v-model="editForm.address" class="input-field" /></label>
                    <label v-if="schema.editableFields.street">Calle<input v-model="editForm.street" class="input-field" /></label>
                    <label v-if="schema.editableFields.neighborhood">Colonia<input v-model="editForm.neighborhood" class="input-field" /></label>
                    <label v-if="schema.editableFields.city">Ciudad / municipio<input v-model="editForm.city" class="input-field" /></label>
                    <label v-if="schema.editableFields.postalCode">Código postal<input v-model="editForm.postalCode" class="input-field" /></label>
                  </div>

                  <div class="ce-edit-section">
                    <span>Tutor / responsable</span>
                    <label>Nombre<input v-model="editForm.guardianName" class="input-field" /></label>
                    <label v-if="schema.editableFields.guardianPhone">Teléfono tutor<input v-model="editForm.guardianPhone" class="input-field" /></label>
                    <label v-if="schema.editableFields.guardianEmail">Email tutor<input v-model="editForm.guardianEmail" class="input-field" type="email" /></label>
                  </div>

                  <div class="ce-edit-section">
                    <span>Académico básico</span>
                    <label v-if="schema.editableFields.status">Estado<input v-model="editForm.status" class="input-field" /></label>
                    <label v-if="schema.editableFields.nivel">Nivel / programa<input v-model="editForm.nivel" class="input-field" /></label>
                    <label v-if="schema.editableFields.grado">Grado<input v-model="editForm.grado" class="input-field" /></label>
                    <label v-if="schema.editableFields.group">Grupo<input v-model="editForm.group" class="input-field" /></label>
                    <label v-if="schema.editableFields.ciclo">Ciclo<input v-model="editForm.ciclo" class="input-field" /></label>
                  </div>
                </form>
              </div>
            </section>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useHead, useState } from '#imports'
import {
  LucideAlertTriangle,
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideFileWarning,
  LucideFilter,
  LucideGraduationCap,
  LucideMailQuestion,
  LucidePencil,
  LucidePhoneOff,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSchool,
  LucideSearch,
  LucideSearchX,
  LucideUserCheck,
  LucideUserRoundX,
  LucideUsers,
  LucideUserX,
  LucideWifiOff,
  LucideX
} from 'lucide-vue-next'
import UiButton from '~/components/ui/UiButton.vue'
import UiChip from '~/components/ui/UiChip.vue'
import UiKpiSparkline from '~/components/ui/UiKpiSparkline.vue'
import StudentsKpiValue from '~/components/students/StudentsKpiValue.vue'
import StudentGradePhotoCard from '~/components/students/StudentGradePhotoCard.vue'
import { useStudentsWorkspaceScale } from '~/composables/useStudentsWorkspaceScale'
import { useToast } from '~/composables/useToast'
import { exportToExcel } from '~/utils/export'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { gradeVisualNumber, studentPresentationStyle } from '~/shared/utils/studentPresentation'

useHead({ bodyAttrs: { class: 'students-route-active control-escolar-route-active' } })

const { show } = useToast()
const state = useState('globalState')
const currentCicloKey = computed(() => normalizeCicloKey(state.value?.ciclo || '2025'))

const plantelOptions = ref([])
const optionsLoading = ref(false)
const selectedAgentId = ref('')
const bridge = ref({ transport: '', fixedAgentId: null, dynamicSelectionAvailable: true })
const kpis = ref({})
const students = ref([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const limit = ref(30)
const loading = ref(false)
const kpiLoading = ref(false)
const refreshing = ref(false)
const exporting = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const selectedStudent = ref(null)
const editing = ref(false)
const searchDraft = ref('')
const responseCache = reactive({})
const editForm = reactive({})
const schema = reactive({
  editableFields: {},
  hasUpdatedAt: false,
  hasProgram: false,
  hasGroup: false
})

const filters = reactive({
  search: '',
  status: 'all',
  missing: 'all',
  program: '',
  grado: '',
  group: '',
  recentlyUpdated: ''
})

const hasDetail = computed(() => Boolean(selectedStudent.value))
const {
  studentsScaleShell,
  studentsScaleShellStyle,
  studentsDesignCanvasStyle,
  scheduleWorkspaceScaleUpdate
} = useStudentsWorkspaceScale(hasDetail)

let searchTimer = null
let studentsRequestId = 0
let kpiRequestId = 0

const cacheKey = computed(() => JSON.stringify({
  agentId: selectedAgentId.value,
  ciclo: currentCicloKey.value,
  page: page.value,
  limit: limit.value,
  filters: { ...filters }
}))

const bridgeWarning = computed(() => {
  if (!bridge.value?.fixedAgentId) return ''
  return `DB_BRIDGE_AGENT_ID está fijo en ${bridge.value.fixedAgentId}. Control Escolar solo podrá consultar ese agente hasta habilitar selección dinámica en el servidor.`
})

const kpiCards = computed(() => [
  { key: 'total', label: 'Total inscritos', value: kpis.value.totalInscritos || 0, icon: LucideUsers, toneClass: 'kpi-green', filter: {}, active: filters.status === 'all' && filters.missing === 'all', sparkline: spark(kpis.value.totalInscritos) },
  { key: 'active', label: 'Activos', value: kpis.value.active || 0, icon: LucideUserCheck, toneClass: 'kpi-teal', filter: { status: 'active', missing: 'all' }, active: filters.status === 'active', sparkline: spark(kpis.value.active) },
  { key: 'inactive', label: 'Bajas / inactivos', value: kpis.value.inactive || 0, icon: LucideUserX, toneClass: 'kpi-gray', filter: { status: 'inactive', missing: 'all' }, active: filters.status === 'inactive', sparkline: spark(kpis.value.inactive) },
  { key: 'new', label: 'Nuevos inscritos', value: kpis.value.newInscritos || 0, icon: LucideGraduationCap, toneClass: 'kpi-blue', filter: { status: 'active', missing: 'all' }, active: false, sparkline: spark(kpis.value.newInscritos) },
  { key: 'incomplete', label: 'Exp. incompletos', value: kpis.value.incompleteFiles || 0, icon: LucideFileWarning, toneClass: 'kpi-red', filter: { missing: 'any' }, active: filters.missing === 'any', sparkline: spark(kpis.value.incompleteFiles) },
  { key: 'curp', label: 'Sin CURP', value: kpis.value.withoutCurp || 0, icon: LucideMailQuestion, toneClass: 'kpi-red', filter: { missing: 'curp' }, active: filters.missing === 'curp', sparkline: spark(kpis.value.withoutCurp) },
  { key: 'phone', label: 'Sin teléfono', value: kpis.value.withoutPhone || 0, icon: LucidePhoneOff, toneClass: 'kpi-gray', filter: { missing: 'phone' }, active: filters.missing === 'phone', sparkline: spark(kpis.value.withoutPhone) },
  { key: 'guardian', label: 'Sin tutor', value: kpis.value.withoutGuardian || 0, icon: LucideUserRoundX, toneClass: 'kpi-gray', filter: { missing: 'guardian' }, active: filters.missing === 'guardian', sparkline: spark(kpis.value.withoutGuardian) }
])

const distributionItems = computed(() => [
  ...(kpis.value.byProgram || []).map(item => ({ ...item, type: 'program', icon: LucideGraduationCap })),
  ...(kpis.value.byGroup || []).slice(0, 6).map(item => ({ ...item, type: 'group', icon: LucideSchool, label: `Grupo ${item.label}` }))
])

const hasSecondaryFilters = computed(() => filters.status !== 'all' || filters.missing !== 'all' || filters.program || filters.grado || filters.group || filters.recentlyUpdated)
const hasAnyFilters = computed(() => hasSecondaryFilters.value || Boolean(filters.search))

const activeFilterLabel = computed(() => {
  if (filters.missing !== 'all') return ({ any: 'Datos faltantes', curp: 'Sin CURP', phone: 'Sin teléfono', guardian: 'Sin tutor' }[filters.missing] || 'Datos faltantes')
  if (filters.status === 'active') return 'Activos'
  if (filters.status === 'inactive') return 'Bajas'
  if (filters.program) return filters.program
  if (filters.group) return `Grupo ${filters.group}`
  if (filters.grado) return filters.grado
  return ''
})

const availableGradeChips = computed(() => {
  const set = new Set(students.value.map(s => s.grado).filter(Boolean))
  return Array.from(set).slice(0, 8)
})

const availableGroupChips = computed(() => {
  const set = new Set(students.value.map(s => s.group).filter(Boolean))
  return Array.from(set).sort().slice(0, 10)
})

const spark = (value) => {
  const n = Number(value || 0)
  if (!n) return []
  return [Math.max(1, Math.round(n * 0.56)), Math.max(1, Math.round(n * 0.72)), Math.max(1, Math.round(n * 0.64)), n]
}

const missingLabel = (field) => ({ curp: 'CURP', phone: 'Teléfono', email: 'Email', guardian: 'Tutor', address: 'Dirección' }[field] || field)

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const applyKpiFilter = (item) => {
  const next = item.filter || {}
  filters.status = next.status || 'all'
  filters.missing = next.missing || 'all'
  page.value = 1
}

const clearKpiFilter = () => {
  filters.status = 'all'
  filters.missing = 'all'
  filters.program = ''
  filters.grado = ''
  filters.group = ''
  filters.recentlyUpdated = ''
  page.value = 1
}

const setStatusFilter = (status) => {
  filters.status = filters.status === status ? 'all' : status
  page.value = 1
}

const setMissingFilter = (missing) => {
  filters.missing = filters.missing === missing ? 'all' : missing
  page.value = 1
}

const clearSecondaryFilters = () => {
  filters.status = 'all'
  filters.missing = 'all'
  filters.program = ''
  filters.grado = ''
  filters.group = ''
  filters.recentlyUpdated = ''
  page.value = 1
}

const clearFilters = () => {
  searchDraft.value = ''
  filters.search = ''
  clearSecondaryFilters()
}

const applyDistributionFilter = (item) => {
  if (item.type === 'program') {
    filters.program = filters.program === item.label ? '' : item.label
  } else if (item.type === 'group') {
    const raw = String(item.label || '').replace(/^Grupo\s+/i, '')
    filters.group = filters.group === raw ? '' : raw
  }
  page.value = 1
}

const isDistributionActive = (item) => {
  if (item.type === 'program') return filters.program === item.label
  if (item.type === 'group') return filters.group === String(item.label || '').replace(/^Grupo\s+/i, '')
  return false
}

const loadOptions = async () => {
  optionsLoading.value = true
  try {
    const res = await $fetch('/api/control-escolar/options')
    plantelOptions.value = Array.isArray(res?.planteles) ? res.planteles : []
    bridge.value = res?.bridge || bridge.value
    if (!selectedAgentId.value) selectedAgentId.value = res?.defaultAgentId || plantelOptions.value[0]?.agentId || ''
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || 'No se pudieron cargar los planteles permitidos.'
  } finally {
    optionsLoading.value = false
  }
}

const applyStudentsResponse = (res) => {
  students.value = Array.isArray(res?.rows) ? res.rows : []
  total.value = Number(res?.total || 0)
  totalPages.value = Math.max(1, Number(res?.totalPages || 1))
  Object.assign(schema, res?.schema || {})

  if (selectedStudent.value) {
    selectedStudent.value = students.value.find(student => student.studentId === selectedStudent.value.studentId) || selectedStudent.value
  }
}

const loadKpis = async () => {
  if (!selectedAgentId.value) return
  const requestId = ++kpiRequestId
  kpiLoading.value = true
  try {
    const res = await $fetch('/api/control-escolar/kpis', {
      params: { agentId: selectedAgentId.value, ciclo: currentCicloKey.value }
    })
    if (requestId !== kpiRequestId) return
    kpis.value = res || {}
  } catch (error) {
    if (requestId === kpiRequestId) errorMessage.value = error?.data?.message || error?.message || 'No se pudieron cargar los KPIs.'
  } finally {
    if (requestId === kpiRequestId) kpiLoading.value = false
  }
}

const loadStudents = async ({ preferCache = true } = {}) => {
  if (!selectedAgentId.value) return
  const key = cacheKey.value
  const requestId = ++studentsRequestId
  errorMessage.value = ''

  if (preferCache && responseCache[key]) {
    applyStudentsResponse(responseCache[key])
    loading.value = false
  } else {
    loading.value = true
  }

  try {
    const res = await $fetch('/api/control-escolar/students', {
      params: {
        agentId: selectedAgentId.value,
        ciclo: currentCicloKey.value,
        search: filters.search,
        status: filters.status,
        missing: filters.missing,
        program: filters.program,
        grado: filters.grado,
        group: filters.group,
        recentlyUpdated: filters.recentlyUpdated,
        page: page.value,
        limit: limit.value
      }
    })
    if (requestId !== studentsRequestId) return
    responseCache[key] = res
    applyStudentsResponse(res)
  } catch (error) {
    if (requestId === studentsRequestId) {
      errorMessage.value = error?.data?.message || error?.message || 'Plantel sin conexión o consulta no disponible.'
    }
  } finally {
    if (requestId === studentsRequestId) loading.value = false
  }
}

const refreshAll = async () => {
  if (!selectedAgentId.value) return
  refreshing.value = true
  const key = cacheKey.value
  delete responseCache[key]
  await Promise.all([loadKpis(), loadStudents({ preferCache: false })])
  refreshing.value = false
}

const selectStudent = (student) => {
  selectedStudent.value = student
  editing.value = false
  nextTick(scheduleWorkspaceScaleUpdate)
}

const startEdit = () => {
  if (!selectedStudent.value) return
  const student = selectedStudent.value
  Object.assign(editForm, {
    apellidoPaterno: student.apellidoPaterno || '',
    apellidoMaterno: student.apellidoMaterno || '',
    nombres: student.nombres || '',
    curp: student.curp || '',
    phone: student.phone || '',
    email: student.email || '',
    guardianName: student.guardianName || '',
    guardianPhone: student.guardianPhone || '',
    guardianEmail: student.guardianEmail || '',
    address: student.address || '',
    street: student.addressParts?.street || '',
    neighborhood: student.addressParts?.neighborhood || '',
    city: student.addressParts?.city || '',
    state: student.addressParts?.state || '',
    postalCode: student.addressParts?.postalCode || '',
    status: student.status || '',
    nivel: student.program || student.nivel || '',
    grado: student.grado || '',
    group: student.group || '',
    ciclo: student.ciclo || currentCicloKey.value
  })
  editing.value = true
}

const cancelEdit = () => {
  editing.value = false
}

const saveStudent = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return
  saving.value = true
  try {
    const res = await $fetch(`/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.studentId)}`, {
      method: 'PATCH',
      body: {
        agentId: selectedAgentId.value,
        fields: { ...editForm }
      }
    })
    if (res?.student) {
      selectedStudent.value = res.student
      students.value = students.value.map(student => student.studentId === res.student.studentId ? res.student : student)
      Object.keys(responseCache).forEach(key => delete responseCache[key])
    }
    editing.value = false
    show('Alumno actualizado en Control Escolar', 'success')
    loadKpis()
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo actualizar el alumno', 'danger')
  } finally {
    saving.value = false
  }
}

const exportRows = async () => {
  const rows = []
  let exportPage = 1
  let exportTotalPages = 1
  do {
    const res = await $fetch('/api/control-escolar/students', {
      params: {
        agentId: selectedAgentId.value,
        ciclo: currentCicloKey.value,
        search: filters.search,
        status: filters.status,
        missing: filters.missing,
        program: filters.program,
        grado: filters.grado,
        group: filters.group,
        recentlyUpdated: filters.recentlyUpdated,
        page: exportPage,
        limit: 200
      }
    })
    rows.push(...(res?.rows || []))
    exportTotalPages = Number(res?.totalPages || 1)
    exportPage += 1
  } while (exportPage <= exportTotalPages && rows.length < 5000)
  return rows
}

const exportCurrentView = async () => {
  if (!selectedAgentId.value) return
  exporting.value = true
  try {
    const rows = await exportRows()
    const filterSummary = [
      filters.search ? `Búsqueda: ${filters.search}` : '',
      filters.status !== 'all' ? `Estado: ${filters.status}` : '',
      filters.missing !== 'all' ? `Faltante: ${filters.missing}` : '',
      filters.program ? `Programa: ${filters.program}` : '',
      filters.grado ? `Grado: ${filters.grado}` : '',
      filters.group ? `Grupo: ${filters.group}` : '',
      filters.recentlyUpdated ? `Actualizado: ${filters.recentlyUpdated} días` : ''
    ].filter(Boolean).join(' | ') || 'Sin filtros'

    const exportData = rows.map(student => ({
      Plantel: student.plantel,
      AgentId: selectedAgentId.value,
      Filtros: filterSummary,
      Matricula: student.matricula,
      NombreCompleto: student.fullName,
      CURP: student.curp,
      Telefono: student.phone,
      Email: student.email,
      Estado: student.status,
      ProgramaNivel: student.program || student.nivel,
      Grado: student.grado,
      Grupo: student.group,
      TutorResponsable: student.guardianName,
      DatosFaltantes: student.missingFields.map(missingLabel).join(' | '),
      UltimaActualizacion: student.updatedAt
    }))

    exportToExcel(`Control_Escolar_${selectedAgentId.value}_${currentCicloKey.value}.xls`, exportData, {
      title: `Control Escolar - Plantel ${selectedAgentId.value}`,
      subtitle: `Ciclo ${currentCicloKey.value}. ${filterSummary}. Exportado ${new Date().toLocaleString('es-MX')}`,
      sheetName: `Control ${selectedAgentId.value}`
    })
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo exportar Control Escolar', 'danger')
  } finally {
    exporting.value = false
  }
}

watch(selectedAgentId, () => {
  page.value = 1
  selectedStudent.value = null
  editing.value = false
  if (selectedAgentId.value) refreshAll()
})

watch(page, () => loadStudents())

watch(() => currentCicloKey.value, () => refreshAll())

watch(() => ({ ...filters }), () => {
  page.value = 1
  loadStudents()
}, { deep: true })

watch(searchDraft, (value) => {
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    filters.search = value
  }, 320)
})

watch(selectedStudent, scheduleWorkspaceScaleUpdate)

onMounted(async () => {
  await loadOptions()
})

onBeforeUnmount(() => {
  if (searchTimer && typeof window !== 'undefined') window.clearTimeout(searchTimer)
})
</script>
