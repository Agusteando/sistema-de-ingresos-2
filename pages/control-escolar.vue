<template>
  <div class="students-screen control-escolar-screen">
    <header class="students-hero ce-hero">
      <div class="hero-copy ce-hero-title">
        <h1>Control Escolar</h1>
      </div>
      <div class="hero-actions ce-hero-actions">
        <div class="ce-route-context" aria-label="Estado de Control Escolar">
          <span class="ce-sync-pill">Base al día</span>
          <span class="ce-cycle-pill">{{ currentCicloLabel }}</span>
        </div>
        <div class="ce-selected-plantel" :class="{ empty: !selectedAgentId }">
          <span>Plantel activo</span>
          <strong>{{ selectedAgentId || 'Selecciona' }}</strong>
        </div>
        <UiButton variant="secondary" :disabled="loadingAny || !selectedAgentId" @click="refreshAll">
          <LucideRefreshCw :size="18" :class="{ spinning: loadingAny }" /> Actualizar
        </UiButton>
        <UiButton variant="secondary" :disabled="!selectedAgentId || !students.length" @click="exportMatriculaDb">
          <LucideFileSpreadsheet :size="18" /> Exportar DB
        </UiButton>
        <UiButton variant="secondary" :disabled="!selectedAgentId || massImporting" @click="massImportInput?.click()">
          <LucideUpload :size="18" /> {{ massImporting ? 'Importando...' : 'Importar DB' }}
        </UiButton>
        <input ref="massImportInput" class="ce-hidden-file" type="file" accept=".csv,text/csv" @change="importMatriculaDb" />
        <UiButton variant="primary" :disabled="!selectedAgentId || !students.length" @click="exportCurrentView">
          <LucideDownload :size="18" /> Exportar
        </UiButton>
      </div>
    </header>


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
    </section>

    <div class="filter-bar ce-filter-bar">
      <div class="ce-primary-filter-row">
        <div class="ce-status-tabs" aria-label="Filtros principales">
          <button
            v-for="filter in primaryFilters"
            :key="filter.key"
            type="button"
            :class="['ce-status-tab', { active: filters.status === filter.key && !filters.quality }]"
            @click="applyPrimaryFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </div>

        <div class="search-control" :class="{ 'has-filter-token': activeFilterLabel }">
          <span class="search-filter-icon" aria-hidden="true"><LucideFilter :size="15" /></span>
          <button v-if="activeFilterLabel" type="button" class="search-filter-token" @click="clearFilters">
            <span>{{ activeFilterLabel }}</span><b aria-hidden="true">×</b>
          </button>
          <LucideSearch class="search-icon" :size="18" />
          <input v-model="filters.search" placeholder="Matrícula, nombre, CURP, teléfono o correo..." @keyup.enter="loadStudents" />
        </div>

        <button type="button" :class="['ce-filter-button', { active: showAdvancedFilters || advancedFilterCount }]" @click="showAdvancedFilters = !showAdvancedFilters">
          <LucideFilter :size="16" /> Filtros
          <b v-if="advancedFilterCount">{{ advancedFilterCount }}</b>
        </button>

        <button type="button" class="ce-clear-link" :disabled="!hasActiveFilters" @click="clearFilters">
          <LucideRotateCcw :size="15" /> Limpiar filtros
        </button>
      </div>

      <div class="ce-secondary-filter-row">
          <div class="ce-chip-cluster" aria-label="Calidad del expediente">
            <span class="ce-chip-label">Calidad del expediente</span>
            <UiChip
              v-for="filter in qualityFilters"
              :key="`quality-${filter.key}`"
              :active="filters.quality === filter.key"
              @click="toggleQualityFilter(filter.key)"
            >
              <span>{{ filter.label }}</span><b class="ce-chip-count">{{ formatNumber(filter.count) }}</b>
            </UiChip>
          </div>

          <div v-if="(showAdvancedFilters || filters.grado || filters.group) && catalogs.grados.length" class="ce-chip-cluster" aria-label="Filtrar por grado">
            <span class="ce-chip-label">Grado</span>
            <UiChip :active="!filters.grado && !filters.group" @click="clearAcademicFilters">Todos</UiChip>
            <UiChip v-for="grado in catalogs.grados" :key="`grado-${grado}`" :active="filters.grado === grado" @click="selectGrade(grado)">{{ grado }}</UiChip>
          </div>

          <div v-if="(showAdvancedFilters || filters.group) && filters.grado && availableGroups.length" class="ce-chip-cluster" aria-label="Filtrar por grupo">
            <span class="ce-chip-label">Grupo</span>
            <UiChip :active-group="filters.group === ''" @click="filters.group = ''">Todos</UiChip>
            <UiChip v-for="grupo in availableGroups" :key="`grupo-${grupo}`" :active-group="filters.group === grupo" @click="toggleFilter('group', grupo)">{{ grupo }}</UiChip>
          </div>
      </div>
    </div>

    <div ref="studentsScaleShell" class="students-scale-shell" :style="studentsScaleShellStyle">
      <div class="students-design-canvas" :style="studentsDesignCanvasStyle">
        <div :class="['students-workspace ce-workspace', { 'has-detail': Boolean(selectedStudent) }]">
          <section :class="['student-list-panel', selectedStudent ? 'is-compact' : 'is-full']">
            <div class="student-list-card ce-list-card">
              <div class="list-titlebar ce-list-titlebar">
                <div class="list-heading-copy">
                  <h2>Alumnos <span>{{ pagination.total }}</span></h2>
                  <p>{{ selectedAgentId ? `Plantel ${selectedAgentId}` : 'Sin plantel activo' }}</p>
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
                  <LucideBuilding2 :size="24" /> Selecciona un plantel específico en la barra lateral para iniciar Control Escolar.
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
                    <span :class="['student-identity', 'ce-student-identity', student.group ? 'has-group-icon' : 'no-group-icon']">
                      <span class="ce-row-check" aria-hidden="true">✓</span>
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
                        <em class="student-meta"><span>{{ compactAcademic(student) }}</span></em>
                        <span class="student-type-line">
                          <span :class="['student-tipo-chip', student.overlayExists ? 'interno' : 'externo']">
                            {{ student.matricula }}
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
                <div class="ce-detail-title">
                  <small>{{ selectedStudent.matricula }} · Matrícula</small>
                  <div class="ce-title-row">
                    <h2>{{ selectedStudent.fullName || 'Ficha de alumno' }}</h2>
                    <span :class="['ce-status-pill large', statusTone(selectedStudent)]">{{ selectedStudent.status || 'Activo' }}</span>
                  </div>
                </div>
                <div class="ce-progress-cluster">
                  <strong>Perfil {{ selectedProfileCompletion }}% completo</strong>
                  <span class="ce-progress-track"><i :style="{ width: `${selectedProfileCompletion}%` }"></i></span>
                  <small>{{ selectedMissingCount ? `Faltan ${selectedMissingCount} datos principales` : 'Datos principales completos' }}</small>
                </div>
                <div class="ce-detail-actions">
                  <UiButton variant="secondary" type="button" :disabled="savingStudent" @click="resetEditForm">Restaurar</UiButton>
                  <UiButton variant="primary" type="button" :disabled="savingStudent" @click="saveStudent">
                    <LucideSave :size="17" /> {{ savingStudent ? 'Guardando...' : 'Guardar ficha' }}
                  </UiButton>
                </div>
                <button type="button" class="detail-shell-close" @click="selectedStudent = null"><LucideX :size="20" /></button>
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
                    <div class="ce-profile-pills">
                      <span>{{ selectedStudent.grado || 'Sin grado' }}</span>
                      <span v-if="selectedStudent.group">Grupo {{ selectedStudent.group }}</span>
                      <span>{{ selectedStudent.nivel || 'Sin nivel' }}</span>
                    </div>
                    <p>Plantel {{ selectedStudent.plantel || selectedAgentId }}</p>
                  </div>
                  <div class="ce-tutor-card">
                    <small>Tutor / Responsable</small>
                    <strong>{{ selectedStudent.guardianName || 'Sin tutor capturado' }}</strong>
                    <span>{{ selectedStudent.phone || selectedStudent.telefonoPadre || selectedStudent.telefonoMadre || 'Sin teléfono' }}</span>
                  </div>
                  <UiGroupIcon v-if="selectedStudent.group" class="ce-profile-watermark" :label="selectedStudent.group" />
                </section>

                <section class="ce-data-section">
                  <div class="ce-section-heading">
                    <span><LucideShieldCheck :size="18" /></span>
                    <div>
                      <h3>Calidad del expediente</h3>
                      <p>{{ selectedStudent.missingFields.length ? 'Completa estos datos para dejar el expediente listo para matrícula.' : 'Expediente listo para matrícula.' }}</p>
                    </div>
                  </div>
                  <div class="ce-missing-grid">
                    <span v-for="field in requiredDataFields" :key="field.key" :class="['ce-missing-chip', { ok: !selectedStudent.missingFields.includes(field.key) && !selectedStudent.missingFields.includes(field.label.toLowerCase()) }]">
                      <component :is="field.icon" :size="14" /> {{ field.label }} <b>{{ selectedStudent.missingFields.includes(field.key) || selectedStudent.missingFields.includes(field.label.toLowerCase()) ? 'Falta' : 'Listo' }}</b>
                    </span>
                  </div>
                </section>

                <section class="ce-husky-card">
                  <div class="ce-section-heading">
                    <span><LucideKeyRound :size="18" /></span>
                    <div>
                      <h3>Husky Pass accesos</h3>
                      <p>Usuario y contraseña desde users.username/users.plaintext.</p>
                    </div>
                  </div>
                  <div v-if="selectedStudent.huskyPassAvailable" class="ce-husky-credentials">
                    <span><small>Usuario</small><strong>{{ selectedStudent.huskyPassUsername }}</strong></span>
                    <span><small>Contraseña</small><strong>{{ selectedStudent.huskyPassPlaintext }}</strong></span>
                  </div>
                  <div v-else class="ce-husky-empty">Sin Husky Pass registrado para esta matrícula.</div>
                  <div class="ce-husky-actions">
                    <small>{{ huskyPassEmailTarget || 'Sin correo de padre/tutor' }}</small>
                    <UiButton variant="secondary" type="button" :disabled="sendingHuskyPass || !selectedStudent.huskyPassAvailable || !huskyPassEmailTarget" @click="sendHuskyPassEmail">
                      <LucideSend :size="16" /> {{ sendingHuskyPass ? 'Enviando...' : 'Enviar acceso' }}
                    </UiButton>
                  </div>
                </section>

                <nav class="ce-detail-tabs" aria-label="Secciones de ficha">
                  <span class="active"><LucideUserRound :size="15" /> Identidad</span>
                  <span><LucideGraduationCap :size="15" /> Escolar</span>
                  <span><LucideUsersRound :size="15" /> Contacto familiar</span>
                  <span>⚙ Sistema</span>
                  <span>□ Observaciones</span>
                </nav>

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

                  <section class="ce-form-card ce-contact-card">
                    <div class="ce-section-heading compact">
                      <span><LucideUsersRound :size="18" /></span>
                      <h3>Contacto familiar</h3>
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
                        <LucideSave :size="17" /> {{ savingStudent ? 'Guardando...' : 'Guardar ficha' }}
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
import { useState } from '#app'
import { useHead } from '#imports'
import {
  LucideAlertTriangle,
  LucideBuilding2,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDatabase,
  LucideDownload,
  LucideFilter,
  LucideFileSpreadsheet,
  LucideGlobe2,
  LucideGraduationCap,
  LucideKeyRound,
  LucideMail,
  LucidePhone,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch,
  LucideSearchX,
  LucideSend,
  LucideShieldCheck,
  LucideUserCheck,
  LucideUserRound,
  LucideUsersRound,
  LucideUpload,
  LucideUserX,
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
import { normalizeCicloKey, formatCicloLabel } from '~/shared/utils/ciclo'
import { normalizeEnrollmentConceptIds, parseEnrollmentConcepts, studentPresentationStyle } from '~/shared/utils/studentPresentation'

useHead({ bodyAttrs: { class: 'students-route-active' } })

const { show } = useToast()
const state = useState('globalState', () => ({ ciclo: '2025' }))
const externalConcepts = ref([])
const ENROLLMENT_CONCEPTS_CACHE_KEY = 'students-enrollment-concepts:v1'
const currentCicloKey = computed(() => normalizeCicloKey(state.value?.ciclo || '2025'))
const currentCicloLabel = computed(() => formatCicloLabel(currentCicloKey.value))
const selectedAgentId = ref('')
const optionsLoading = ref(false)
const kpisLoading = ref(false)
const studentsLoading = ref(false)
const savingStudent = ref(false)
const massImporting = ref(false)
const sendingHuskyPass = ref(false)
const loadError = ref('')
const saveError = ref('')
const students = ref([])
const selectedStudent = ref(null)
const massImportInput = ref(null)
const kpis = ref(null)
const catalogs = reactive({ niveles: [], grados: [], grupos: [], gruposPorGrado: {} })
const DEFAULT_QUICK_FILTER = 'inscritos'
const activeQuickFilter = ref(DEFAULT_QUICK_FILTER)
const showAdvancedFilters = ref(false)
const pagination = reactive({ page: 1, limit: 25, total: 0, pages: 1 })
const filters = reactive({ search: '', status: DEFAULT_QUICK_FILTER, quality: '', grado: '', group: '', recent: '' })
const editForm = reactive({})
let searchTimer = null

const hasDetail = computed(() => Boolean(selectedStudent.value))
const { studentsScaleShell, studentsScaleShellStyle, studentsDesignCanvasStyle, scheduleWorkspaceScaleUpdate } = useStudentsWorkspaceScale(hasDetail)
const loadingAny = computed(() => optionsLoading.value || kpisLoading.value || studentsLoading.value || savingStudent.value)
const hasActiveFilters = computed(() => Boolean(
  filters.search ||
  filters.quality ||
  filters.grado ||
  filters.group ||
  filters.recent ||
  (filters.status && filters.status !== DEFAULT_QUICK_FILTER)
))
const activeFilterLabel = computed(() => {
  const active = []
  if (filters.status && filters.status !== DEFAULT_QUICK_FILTER) active.push(statusLabel(filters.status))
  if (filters.quality) active.push(qualityLabel(filters.quality))
  if (filters.grado) active.push(filters.grado)
  if (filters.group) active.push(`Grupo ${filters.group}`)
  if (filters.search) active.push('Búsqueda')
  return active.slice(0, 2).join(' · ')
})
const availableGroups = computed(() => {
  if (!filters.grado) return []
  const byGrade = catalogs.gruposPorGrado || {}
  return Array.isArray(byGrade[filters.grado]) ? byGrade[filters.grado] : catalogs.grupos
})

const advancedFilterCount = computed(() => [filters.quality, filters.grado, filters.group, filters.recent].filter(Boolean).length)

const primaryFilters = [
  { key: 'all', label: 'Todos' },
  { key: 'inscritos', label: 'Inscritos' },
  { key: 'internos', label: 'Internos' },
  { key: 'externos', label: 'Externos' },
  { key: 'no_inscritos', label: 'No inscritos' },
  { key: 'bajas', label: 'Bajas' }
]

const qualityFilters = computed(() => {
  const data = kpis.value || {}
  return [
    { key: 'incomplete', label: 'Expediente incompleto', count: data.expedientesIncompletos || 0 },
    { key: 'curp', label: 'Sin CURP', count: data.sinCurp || 0 },
    { key: 'phone', label: 'Sin teléfono', count: data.sinTelefono || 0 },
    { key: 'email', label: 'Sin email', count: data.sinEmail || 0 },
    { key: 'guardian', label: 'Sin tutor', count: data.sinTutor || 0 },
    { key: 'contact', label: 'Sin contacto', count: data.sinContacto || 0 }
  ]
})

const kpiCards = computed(() => {
  const data = kpis.value || {}
  return [
    { key: 'inscritos', label: 'Inscritos', value: data.inscritos || data.totalInscritos || 0, tone: 'kpi-green', icon: LucideUsersRound, sparkline: data.sparklineInscritos || [0, data.inscritos || data.totalInscritos || 0] },
    { key: 'internos', label: 'Internos', value: data.internos || 0, tone: 'kpi-teal', icon: LucideUserCheck, sparkline: data.sparklineInternos || [0, data.internos || 0] },
    { key: 'externos', label: 'Externos', value: data.externos || 0, tone: 'kpi-blue', icon: LucideGlobe2, sparkline: data.sparklineExternos || [0, data.externos || 0] },
    { key: 'no_inscritos', label: 'No inscritos', value: data.noInscritos || 0, tone: 'kpi-red', icon: LucideUserX, sparkline: data.sparklineNoInscritos || [0, data.noInscritos || 0] },
    { key: 'bajas', label: 'Bajas', value: data.bajas || 0, tone: 'kpi-gray', icon: LucideUserX, sparkline: data.sparklineBajas || [0, data.bajas || 0] }
  ]
})


const requiredDataFields = [
  { key: 'curp', label: 'CURP', icon: LucideShieldCheck },
  { key: 'teléfono', label: 'Teléfono', icon: LucidePhone },
  { key: 'email', label: 'Email', icon: LucideMail },
  { key: 'tutor', label: 'Tutor', icon: LucideUsersRound }
]

const formatNumber = (value) => Number(value || 0).toLocaleString('es-MX')
const statusLabel = (value) => ({ all: 'Todos', inscritos: 'Inscritos', activos: 'Activos', active: 'Activos', internos: 'Internos', externos: 'Externos', no_inscritos: 'No inscritos', bajas: 'Bajas', baja: 'Bajas', sin_contacto: 'Sin contacto' }[value] || value)
const qualityLabel = (value) => ({ complete: 'Completo', incomplete: 'Expediente incompleto', curp: 'Sin CURP', phone: 'Sin teléfono', email: 'Sin email', guardian: 'Sin tutor', contact: 'Sin contacto' }[value] || value)
const compactAcademic = (student) => [student.grado, student.group ? `Grupo ${student.group}` : '', student.nivel].filter(Boolean).join(' · ') || 'Sin datos académicos'
const statusTone = (student) => String(student?.status || '').toLowerCase() === 'baja' ? 'danger' : String(student?.status || '').toLowerCase() === 'activo' ? 'success' : 'neutral'
const completionFor = (student) => {
  const total = requiredDataFields.length
  const missing = requiredDataFields.filter((field) => student?.missingFields?.includes(field.key) || student?.missingFields?.includes(field.label.toLowerCase())).length
  return Math.max(0, Math.round(((total - missing) / total) * 100))
}
const selectedProfileCompletion = computed(() => completionFor(selectedStudent.value))
const selectedMissingCount = computed(() => requiredDataFields.filter((field) => selectedStudent.value?.missingFields?.includes(field.key) || selectedStudent.value?.missingFields?.includes(field.label.toLowerCase())).length)
const huskyPassEmailTarget = computed(() => selectedStudent.value?.emailPadre || selectedStudent.value?.emailMadre || selectedStudent.value?.email || selectedStudent.value?.huskyPassEmail || '')

const buildScopeQuery = () => ({
  agentId: selectedAgentId.value || undefined,
  ciclo: currentCicloKey.value,
  concepts: externalConcepts.value.join(',') || undefined
})

const buildQuery = (extra = {}) => ({
  ...buildScopeQuery(),
  search: filters.search || undefined,
  status: filters.status || undefined,
  quality: filters.quality || undefined,
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
    loadError.value = ''
    selectedAgentId.value = response.activePlantel || ''
  } catch (error) {
    selectedAgentId.value = ''
    loadError.value = error?.data?.message || error?.message || 'No se pudo resolver el plantel activo.'
  } finally {
    optionsLoading.value = false
  }
}

const loadKpis = async () => {
  if (!selectedAgentId.value) return
  kpisLoading.value = true
  try {
    const response = await $fetch('/api/control-escolar/kpis', { query: buildScopeQuery() })
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
    Object.assign(catalogs, response.catalogs || { niveles: [], grados: [], grupos: [], gruposPorGrado: {} })
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

const clearQuickFilters = () => {
  filters.status = DEFAULT_QUICK_FILTER
  filters.quality = ''
  activeQuickFilter.value = DEFAULT_QUICK_FILTER
}

const toggleFilter = (key, value) => {
  filters[key] = filters[key] === value ? '' : value
  pagination.page = 1
}

const clearAcademicFilters = () => {
  filters.grado = ''
  filters.group = ''
  pagination.page = 1
}

const selectGrade = (grado) => {
  filters.grado = filters.grado === grado ? '' : grado
  filters.group = ''
  pagination.page = 1
}

const clearFilters = () => {
  Object.assign(filters, { search: '', status: DEFAULT_QUICK_FILTER, quality: '', grado: '', group: '', recent: '' })
  activeQuickFilter.value = DEFAULT_QUICK_FILTER
  pagination.page = 1
}

const applyPrimaryFilter = (key) => {
  filters.status = key
  filters.quality = ''
  activeQuickFilter.value = key
  pagination.page = 1
}

const toggleQualityFilter = (key) => {
  filters.quality = filters.quality === key ? '' : key
  if (filters.quality) activeQuickFilter.value = 'quality'
  else activeQuickFilter.value = filters.status || DEFAULT_QUICK_FILTER
  pagination.page = 1
}

const applyKpiFilter = (key) => {
  if (key === 'incomplete') {
    filters.status = DEFAULT_QUICK_FILTER
    filters.quality = filters.quality === 'incomplete' ? '' : 'incomplete'
    activeQuickFilter.value = filters.quality ? key : DEFAULT_QUICK_FILTER
  } else {
    const next = activeQuickFilter.value === key && key !== DEFAULT_QUICK_FILTER ? DEFAULT_QUICK_FILTER : key
    filters.status = next
    filters.quality = ''
    activeQuickFilter.value = next
  }
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
      query: buildScopeQuery(),
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

const exportMatriculaDb = () => {
  if (!selectedAgentId.value) return
  const params = new URLSearchParams()
  Object.entries(buildQuery({ page: undefined, limit: undefined })).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  window.open(`/api/control-escolar/matricula-db/export?${params.toString()}`, '_blank')
}

const importMatriculaDb = async (event) => {
  const file = event?.target?.files?.[0]
  if (!file || !selectedAgentId.value) return
  massImporting.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const response = await $fetch('/api/control-escolar/matricula-db/import', {
      method: 'POST',
      query: buildScopeQuery(),
      body: form
    })
    const summary = response?.summary || {}
    const skipped = Number(summary.skipped || 0)
    show(`Importación aplicada: ${summary.updated || 0} actualizados${skipped ? `, ${skipped} omitidos` : ''}.`, skipped ? 'warning' : 'success')
    if (summary.errors?.length) console.warn('[Control Escolar] Errores de importación masiva', summary.errors)
    await refreshAll()
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo importar el archivo.', 'danger')
  } finally {
    massImporting.value = false
    if (event?.target) event.target.value = ''
  }
}

const sendHuskyPassEmail = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return
  sendingHuskyPass.value = true
  try {
    const response = await $fetch(`/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}/husky-pass-email`, {
      method: 'POST',
      query: buildScopeQuery(),
      body: { to: huskyPassEmailTarget.value }
    })
    show(`Husky Pass enviado a ${response.sentTo}.`, 'success')
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo enviar Husky Pass.', 'danger')
  } finally {
    sendingHuskyPass.value = false
  }
}

const cacheEnrollmentConcepts = (conceptIds) => {
  if (!process.client || !Array.isArray(conceptIds) || !conceptIds.length) return
  try {
    localStorage.setItem(ENROLLMENT_CONCEPTS_CACHE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      concepts: conceptIds
    }))
  } catch (error) {
    console.warn('[Control Escolar] No se pudo guardar la configuración de inscripción.', error)
  }
}

const hydrateCachedEnrollmentConcepts = () => {
  if (!process.client || externalConcepts.value.length) return
  try {
    const parsed = JSON.parse(localStorage.getItem(ENROLLMENT_CONCEPTS_CACHE_KEY) || 'null')
    const conceptIds = normalizeEnrollmentConceptIds(parsed?.concepts)
    if (conceptIds.length) externalConcepts.value = conceptIds
  } catch (error) {
    console.warn('[Control Escolar] No se pudo leer la configuración de inscripción.', error)
  }
}

const parseEnrollmentConfig = (obj) => {
  const conceptIds = parseEnrollmentConcepts(obj)
  if (!conceptIds.length) return
  externalConcepts.value = conceptIds
  cacheEnrollmentConcepts(conceptIds)
}

const loadEnrollmentConfig = async ({ refreshStudents = false } = {}) => {
  const previousConcepts = externalConcepts.value.join('|')
  try {
    const configData = await $fetch('https://matricula.casitaapps.com/api/enrollment-config/all')
    parseEnrollmentConfig(configData)
  } catch (error) {
    console.warn('[Control Escolar] Usando configuración de inscripción local o por defecto.', error)
  }

  if (refreshStudents && externalConcepts.value.join('|') !== previousConcepts) {
    await refreshAll()
  }
}

watch(() => ({ ...filters }), () => {
  pagination.page = 1
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(loadStudents, 320)
}, { deep: true })

watch(() => pagination.page, () => loadStudents())
watch(() => [currentCicloKey.value, externalConcepts.value.join('|')], () => {
  pagination.page = 1
  refreshAll()
})
watch(selectedAgentId, () => nextTick(scheduleWorkspaceScaleUpdate))

onMounted(async () => {
  hydrateCachedEnrollmentConcepts()
  await loadOptions()
  if (selectedAgentId.value) await refreshAll()
  await loadEnrollmentConfig({ refreshStudents: true })
})
</script>

<style scoped>
.control-escolar-screen {
  gap: 0;
}

.ce-hero {
  min-height: 38px;
  margin-bottom: 7px;
  align-items: center;
}

.ce-hero-title h1 {
  margin: 0;
  color: #10203a;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -.035em;
}

.ce-route-context {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ce-sync-pill,
.ce-cycle-pill {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(207, 217, 229, .85);
  border-radius: 13px;
  background: #fff;
  color: #10203a;
  box-shadow: 0 8px 18px rgba(21, 35, 60, .04);
  font-size: 12px;
  font-weight: 850;
}

.ce-sync-pill::before {
  content: '✓';
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border: 2px solid #3f9138;
  border-radius: 999px;
  color: #3f9138;
  font-size: 11px;
  line-height: 1;
}

.ce-cycle-pill::before {
  content: '▦';
  color: #2f8f37;
  font-size: 16px;
  line-height: 1;
}

.ce-hero-actions {
  align-items: stretch;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ce-selected-plantel {
  display: flex;
  min-width: 126px;
  flex-direction: column;
  justify-content: center;
  padding: 6px 14px;
  border: 1px solid rgba(63, 145, 56, .18);
  border-radius: 13px;
  background: linear-gradient(180deg, #fff, #f7fbf5);
  box-shadow: 0 8px 18px rgba(21, 35, 60, .04);
}

.ce-selected-plantel span {
  color: #6b758f;
  font-size: 9.5px;
  font-weight: 880;
  letter-spacing: .045em;
  line-height: 1.1;
  text-transform: uppercase;
}

.ce-selected-plantel strong {
  color: #1d912d;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
}

.ce-selected-plantel.empty strong {
  color: #7a849a;
  font-size: 13px;
}

.spinning { animation: ce-spin 900ms linear infinite; }
.ce-hidden-file { display: none; }
@keyframes ce-spin { to { transform: rotate(360deg); } }

.ce-kpi-system {
  margin-bottom: 6px;
}

.ce-kpi-strip {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  min-height: 70px;
  border-radius: 0;
  border-inline: 0;
  box-shadow: none;
}

.ce-kpi-strip .kpi-card {
  height: 64px;
  min-height: 64px;
}

.ce-kpi-strip .kpi-icon {
  width: 38px;
  height: 38px;
}

.ce-kpi-strip .kpi-text strong {
  font-size: clamp(20px, 1.7vw, 28px);
}

.ce-kpi-strip .kpi-card.active {
  background: linear-gradient(90deg, rgba(86, 171, 73, .13), rgba(255,255,255,0));
}

.ce-program-rail {
  display: none;
}

.ce-filter-bar {
  display: flex;
  min-height: 52px;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 9px;
  padding: 7px 0;
  border: 0;
  border-top: 1px solid var(--students-border-soft);
  border-bottom: 1px solid var(--students-border-soft);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.ce-primary-filter-row {
  display: grid;
  grid-template-columns: minmax(530px, max-content) minmax(320px, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.ce-status-tabs {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.ce-status-tab {
  display: inline-flex;
  min-height: 35px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid #d9e3ee;
  border-radius: 10px;
  background: #fff;
  color: #15233c;
  font-size: 11px;
  font-weight: 850;
  box-shadow: 0 5px 12px rgba(21, 35, 60, .035);
  cursor: pointer;
}

.ce-status-tab.active {
  border-color: #3f9138;
  background: linear-gradient(180deg, #5bbd55, #278c31);
  color: #fff;
  box-shadow: 0 10px 20px rgba(63, 145, 56, .22);
}

.ce-filter-bar .search-control {
  height: 39px;
  min-width: 0;
  border-radius: 13px;
  background: #fff;
}

.ce-filter-button,
.ce-clear-link {
  display: inline-flex;
  min-height: 37px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;
}

.ce-filter-button {
  min-width: 92px;
  border: 1px solid #d9e3ee;
  background: #fff;
  color: #15233c;
}

.ce-filter-button.active {
  border-color: rgba(63, 145, 56, .28);
  background: #f4fbf2;
  color: #21882e;
}

.ce-filter-button b {
  display: inline-flex;
  min-width: 17px;
  height: 17px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #2f9138;
  color: #fff;
  font-size: 9px;
}

.ce-clear-link {
  border: 0;
  background: transparent;
  color: #21882e;
}

.ce-clear-link:disabled {
  color: #a8b2c2;
  cursor: not-allowed;
}

.ce-secondary-filter-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 1px;
}

.ce-chip-cluster {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ce-chip-label {
  color: #6f7b95;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .045em;
  text-transform: uppercase;
  white-space: nowrap;
}

.ce-secondary-filter-row :deep(.ui-chip),
.ce-secondary-filter-row :deep(button) {
  min-height: 26px;
  border-radius: 999px;
  font-size: 9.5px;
  white-space: nowrap;
}

.ce-chip-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  border-radius: 999px;
  background: rgba(32, 136, 45, .12);
  color: #20882d;
  font-size: 9px;
  font-weight: 900;
}

.ce-workspace.has-detail {
  grid-template-columns: minmax(430px, .52fr) minmax(820px, 1.48fr);
  gap: 12px;
}

.ce-list-card {
  --student-list-balance-col: clamp(124px, 8.5vw, 150px);
  --student-list-quality-col: clamp(108px, 7.5vw, 134px);
  --student-list-action-col: clamp(38px, 2.8vw, 46px);
  --student-list-row-height: clamp(70px, 5vw, 82px);
  --student-list-grade-size: clamp(52px, 3.8vw, 64px);
  --student-list-grade-height: clamp(50px, 3.6vw, 60px);
  --student-list-crest-size: clamp(28px, 2.1vw, 34px);
  grid-template-rows: 44px minmax(0, 1fr);
  border-radius: 14px;
  background: #fff;
}

.ce-list-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--students-border-soft);
}

.ce-list-titlebar h2 {
  margin: 0;
  color: #15233c;
  font-size: 15px;
  font-weight: 880;
  letter-spacing: -.025em;
}

.ce-list-titlebar h2 span { color: #20922d; }
.ce-list-titlebar p { display: none; }

.ce-pagination-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6f7b95;
  font-size: 11px;
  font-weight: 800;
}

.ce-pagination-mini button {
  display: inline-flex;
  width: 29px;
  height: 29px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--students-border);
  border-radius: 10px;
  background: #fff;
  color: #5d687f;
}

.ce-pagination-mini button:disabled {
  opacity: .42;
  cursor: not-allowed;
}

.ce-list-columns {
  display: none;
}

.ce-list-scroll {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 7px 0 11px;
}

.ce-student-row {
  width: calc(100% - 7px);
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr) var(--student-list-balance-col) var(--student-list-quality-col) var(--student-list-action-col);
  min-height: var(--student-list-row-height);
  margin: 0 7px 7px 0;
  padding-left: 12px;
  border-radius: 14px;
}

.ce-workspace.has-detail .ce-student-row {
  grid-template-columns: minmax(0, 1fr) var(--student-list-action-col);
}

.ce-workspace.has-detail .ce-profile-cell,
.ce-workspace.has-detail .ce-quality-cell {
  display: none;
}

.ce-student-row.missing-overlay { border-style: dashed; }

.ce-student-identity {
  grid-template-columns: 26px var(--student-list-grade-size) var(--student-list-crest-size) minmax(0, 1fr);
  gap: 8px;
}

.ce-student-identity.no-group-icon {
  grid-template-columns: 26px var(--student-list-grade-size) minmax(0, 1fr);
}

.ce-student-row .student-copy {
  width: 100%;
  max-width: 100%;
}

.ce-student-row .student-copy strong {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}

.ce-row-check {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: #67af5a;
  color: #fff;
  font-size: 14px;
  font-weight: 900;
  box-shadow: 0 8px 16px rgba(63, 145, 56, .18);
}

.ce-profile-cell,
.ce-quality-cell {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding-right: 8px;
}

.ce-profile-cell strong,
.ce-quality-cell strong {
  max-width: 100%;
  overflow: hidden;
  color: #15233c;
  font-size: 12px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-profile-cell small,
.ce-quality-cell small {
  max-width: 100%;
  overflow: hidden;
  color: #71809a;
  font-size: 10px;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-status-pill {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 880;
}

.ce-status-pill.success { background: #eef8eb; color: #21882e; }
.ce-status-pill.danger { background: #fff0ee; color: #c8423b; }
.ce-status-pill.neutral { background: #f2f5f8; color: #657083; }
.ce-status-pill.large { min-height: 28px; padding-inline: 12px; }

.ce-row-action {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--students-border);
  border-radius: 12px;
  background: #fff;
  color: #71809a;
  box-shadow: 0 8px 16px rgba(21, 35, 60, .06);
}

.ce-state-card {
  flex-direction: column;
  text-align: center;
}

.ce-state-card.error { color: #c8423b; }
.ce-inline-action { border: 0; background: transparent; color: #2f7f32; font-weight: 840; }

.ce-skeleton-stack {
  display: grid;
  gap: 8px;
  padding-right: 18px;
}

.ce-skeleton-row {
  height: var(--student-list-row-height);
  border-radius: 14px;
  background: linear-gradient(90deg, #f3f6f9, #fff, #f3f6f9);
  background-size: 220% 100%;
  animation: ce-loading 1.4s linear infinite;
}

@keyframes ce-loading { to { background-position: -220% 0; } }

.ce-detail-panel {
  display: flex;
  min-height: 0;
}

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
  grid-template-columns: minmax(0, 1fr) 260px auto 34px;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--students-border-soft);
  background: linear-gradient(180deg, #fff, #fbfdfb);
}

.ce-detail-title {
  min-width: 0;
}

.ce-detail-title small {
  color: #6f7b95;
  font-size: 10.5px;
  font-weight: 850;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.ce-title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.ce-title-row h2 {
  margin: 0;
  overflow: hidden;
  color: #10203a;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: -.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-progress-cluster {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.ce-progress-cluster strong {
  color: #5f6d84;
  font-size: 11px;
  font-weight: 850;
}

.ce-progress-track {
  display: block;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2ece4;
}

.ce-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2f9c3b, #91c76f);
}

.ce-progress-cluster small {
  color: #72809a;
  font-size: 10px;
  font-weight: 680;
}

.ce-detail-actions {
  display: flex;
  gap: 8px;
}

.detail-shell-close {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #10203a;
  cursor: pointer;
}

.detail-shell-close:hover {
  background: #f5f7f9;
}

.ce-detail-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 12px 14px 14px;
  background: #fff;
}

.ce-profile-card,
.ce-data-section,
.ce-form-card {
  border: 1px solid var(--students-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 7px 18px rgba(21,35,60,.035);
}

.ce-profile-card {
  position: relative;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) minmax(220px, .5fr);
  align-items: center;
  gap: 16px;
  min-height: 104px;
  overflow: hidden;
  padding: 13px 18px;
  background: linear-gradient(110deg, #fff 0%, #fff 68%, #f4fbf2 100%);
}

.ce-detail-photo {
  --student-grade-photo-width: 86px;
  --student-grade-photo-height: 80px;
  --student-grade-photo-radius: 14px;
}

.ce-profile-copy,
.ce-tutor-card {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.ce-profile-copy strong {
  display: block;
  overflow: hidden;
  color: #15233c;
  font-size: 18px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-profile-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.ce-profile-pills span {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: #eaf7e7;
  color: #20882d;
  font-size: 10px;
  font-weight: 850;
}

.ce-profile-copy p {
  margin: 7px 0 0;
  color: #66758e;
  font-size: 11px;
  font-weight: 720;
}

.ce-tutor-card small {
  display: block;
  color: #6d7890;
  font-size: 10px;
  font-weight: 860;
  letter-spacing: .04em;
}

.ce-tutor-card strong {
  display: block;
  margin-top: 5px;
  color: #16243d;
  font-size: 12px;
  font-weight: 860;
}

.ce-tutor-card span {
  display: block;
  margin-top: 4px;
  color: #5e6c84;
  font-size: 12px;
  font-weight: 680;
}

.ce-profile-watermark {
  --group-icon-size: 118px;
  position: absolute;
  right: 34px;
  top: 50%;
  z-index: 0;
  color: #3f9138;
  opacity: .12;
  transform: translateY(-50%) rotate(-7deg);
}

.ce-data-section {
  display: grid;
  grid-template-columns: minmax(240px, .45fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-color: rgba(63,145,56,.18);
  background: linear-gradient(90deg, #f7fcf5, #fff);
}

.ce-section-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ce-section-heading.compact {
  align-items: center;
  margin-bottom: 11px;
}

.ce-section-heading > span {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eaf7e7;
  color: #2f8f37;
}

.ce-section-heading h3 {
  margin: 0;
  color: #15233c;
  font-size: 13px;
  font-weight: 880;
}

.ce-section-heading p {
  margin: 3px 0 0;
  color: #71809a;
  font-size: 11px;
  font-weight: 620;
  line-height: 1.25;
}

.ce-missing-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}

.ce-missing-chip {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(200,66,59,.2);
  border-radius: 13px;
  background: #fff5f3;
  color: #c8423b;
  font-size: 11px;
  font-weight: 860;
}

.ce-missing-chip b {
  font-size: 9px;
  font-weight: 900;
  opacity: .82;
}

.ce-missing-chip.ok {
  border-color: rgba(63,145,56,.2);
  background: #eff8eb;
  color: #21882e;
}

.ce-husky-card {
  display: grid;
  grid-template-columns: minmax(240px, .55fr) minmax(260px, .7fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(42, 126, 191, .16);
  border-radius: 14px;
  background: linear-gradient(90deg, #f7fbff, #fff);
  box-shadow: 0 7px 18px rgba(21,35,60,.035);
}

.ce-husky-credentials {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ce-husky-credentials span {
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--students-border);
  border-radius: 12px;
  background: #fff;
}

.ce-husky-credentials small,
.ce-husky-actions small {
  display: block;
  color: #6f7b95;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.ce-husky-credentials strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #15233c;
  font-size: 12px;
  font-weight: 860;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-husky-empty {
  padding: 10px 12px;
  border: 1px dashed #ccd8e5;
  border-radius: 12px;
  color: #6f7b95;
  font-size: 11px;
  font-weight: 720;
}

.ce-husky-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.ce-husky-actions small {
  max-width: 190px;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-detail-tabs {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 28px;
  padding: 0 18px;
  border-bottom: 1px solid var(--students-border-soft);
  color: #60708a;
  font-size: 11px;
  font-weight: 840;
}

.ce-detail-tabs span {
  display: inline-flex;
  height: 42px;
  align-items: center;
  gap: 7px;
  border-bottom: 3px solid transparent;
}

.ce-detail-tabs .active {
  border-bottom-color: #279233;
  color: #20882d;
}

.ce-edit-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.ce-form-card {
  padding: 14px;
}

.ce-contact-card,
.ce-save-error,
.ce-detail-footer {
  grid-column: 1 / -1;
}

.ce-form-grid {
  display: grid;
  gap: 10px;
}

.ce-form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ce-form-card:not(.ce-contact-card) .ce-form-grid.three {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ce-form-grid label,
.ce-wide-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.ce-form-grid span,
.ce-wide-field span {
  color: #60708a;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--students-border);
  border-radius: 10px;
  background: #fff;
  color: #15233c;
  font-size: 12px;
  font-weight: 650;
  outline: 0;
  padding: 0 11px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
}

.ce-form-grid input:focus,
.ce-form-grid select:focus,
.ce-wide-field textarea:focus {
  border-color: rgba(63,145,56,.42);
  box-shadow: 0 0 0 3px rgba(63,145,56,.1);
}

.ce-wide-field {
  margin-top: 10px;
}

.ce-wide-field textarea {
  min-height: 62px;
  padding: 9px 10px;
  resize: vertical;
}

.ce-save-error {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(200,66,59,.2);
  border-radius: 12px;
  background: #fff5f3;
  color: #c8423b;
  font-size: 12px;
  font-weight: 760;
}

.ce-detail-footer {
  position: sticky;
  bottom: -14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 -14px -14px;
  padding: 11px 24px;
  border-top: 1px solid rgba(63,145,56,.12);
  background: linear-gradient(90deg, #f2faee, #fff);
}

.ce-detail-footer span {
  color: #526078;
  font-size: 11px;
  font-weight: 720;
}

.ce-detail-footer div {
  display: flex;
  gap: 8px;
}

@media (max-width: 1320px) {
  .ce-kpi-strip { grid-template-columns: repeat(5, minmax(148px, 1fr)); overflow-x: auto; }
  .ce-primary-filter-row { grid-template-columns: 1fr minmax(300px, .9fr) auto; }
  .ce-clear-link { display: none; }
  .ce-status-tabs { overflow-x: auto; }
  .ce-workspace.has-detail { grid-template-columns: minmax(400px, .62fr) minmax(650px, 1.38fr); }
  .ce-detail-header { grid-template-columns: minmax(0, 1fr) 220px 34px; }
  .ce-detail-actions { display: none; }
}

@media (max-width: 980px) {
  .ce-workspace,
  .ce-workspace.has-detail {
    display: flex;
    flex-direction: column;
    height: auto;
  }
  .ce-list-card,
  .ce-detail-panel { height: 660px; }
  .ce-detail-header { grid-template-columns: minmax(0, 1fr) 34px; }
  .ce-progress-cluster { display: none; }
  .ce-profile-card,
  .ce-data-section,
  .ce-husky-card,
  .ce-edit-form { grid-template-columns: 1fr; }
  .ce-missing-grid,
  .ce-form-grid.three,
  .ce-form-card:not(.ce-contact-card) .ce-form-grid.three { grid-template-columns: 1fr; }
  .ce-detail-tabs { gap: 14px; overflow-x: auto; }
}
</style>
