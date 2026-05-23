<template>
  <section :class="['student-list-panel', hasAccountWorkspace ? 'is-compact' : 'is-full']">
    <div class="student-list-card">
      <div class="list-titlebar">
        <div class="list-heading">
          <div class="list-heading-copy">
            <h2>Alumnos <span>{{ displayedStudents.length }}</span></h2>
          </div>
        </div>
        <div class="list-title-actions">
          <button v-if="selectedCount > 0" type="button" class="title-action-pill" title="Asignar sección" @click="$emit('open-section-selection')">
            <LucideTags :size="14" />
            <span>Sección</span>
          </button>
          <button v-if="hasActiveFilters" type="button" aria-label="Limpiar filtros" title="Limpiar filtros" @click="$emit('clear-filters')">
            <LucideRotateCcw :size="16" />
          </button>
        </div>
      </div>

      <div :class="['list-columns', hasAccountWorkspace ? 'compact' : 'full']">
        <span>Alumno</span>
        <span>Saldo</span>
        <span></span>
      </div>

      <div v-if="displayedStudents.length" class="selection-control-row">
        <button
          type="button"
          :class="['select-visible-row-control', { active: allDisplayedSelected, partial: someDisplayedSelected && !allDisplayedSelected }]"
          :title="allDisplayedSelected ? 'Quitar visibles' : 'Seleccionar todos los visibles'"
          @click="$emit('toggle-displayed-selection')"
        >
          <span class="select-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path class="check-mark" d="M5 12.5l4.2 4.2L19 7" />
              <path class="partial-mark" d="M6 12h12" />
            </svg>
          </span>
          <span>Seleccionar todos los visibles ({{ displayedStudents.length }})</span>
        </button>
        <strong v-if="selectedCount > 0">{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
      </div>

      <div :class="['student-list-scroll', { 'is-source-unavailable': sourceUnavailable }]">
        <div v-if="loading" class="empty-state loading-state">
          <span class="liquid-loader" aria-hidden="true"><i></i><i></i><i></i></span>
          Cargando estudiantes...
        </div>
        <section v-else-if="sourceUnavailable" class="student-source-unavailable" aria-live="polite">
          <div class="source-orb" aria-hidden="true">
            <LucideCloudOff :size="30" />
            <span><LucideComputer :size="18" /></span>
          </div>
          <div class="source-copy">
            <span class="source-eyebrow">Conexión local en pausa</span>
            <h3>{{ sourceUnavailableTitle }}</h3>
            <p>{{ sourceUnavailableMessage }}</p>
          </div>
          <div class="source-hints">
            <span><LucideComputer :size="15" /> Equipo del plantel</span>
            <span><LucideClock3 :size="15" /> {{ sourceUnavailableHint }}</span>
          </div>
          <button type="button" class="source-retry" @click="$emit('refresh-source')">
            <LucideRotateCcw :size="16" />
            Intentar de nuevo
          </button>
        </section>
        <div v-else-if="!displayedStudents.length" class="empty-state muted">No hay registros bajo los filtros actuales.</div>
        <template v-else>
          <div
            v-for="student in displayedStudents"
            :key="student.matricula"
            role="button"
            tabindex="0"
            :style="studentPresentationStyle(student)"
            @click="$emit('student-row-click', student, $event)"
            @keydown.enter.prevent="$emit('student-row-click', student, $event)"
            @keydown.space.prevent="$emit('toggle-student-selection', student, $event)"
            @contextmenu.prevent="$emit('show-student-menu', $event, student)"
            :class="[
              'student-row',
              hasAccountWorkspace ? 'compact' : 'full',
              selectedStudent?.matricula === student.matricula ? 'selected' : '',
              isSelected(student) ? 'multi-selected' : '',
              student.customSections?.length ? 'has-sections' : '',
              student.estatus !== 'Activo' ? 'inactive' : (!isStudentEnrolled(student, externalConcepts) ? 'unenrolled' : '')
            ]"
          >
            <UiGroupIcon
              class="student-group-watermark"
              :class="{ 'is-missing-group': studentMissingGroup(student) }"
              :label="studentGroupLabel(student)"
              :missing="studentMissingGroup(student)"
            />
            <span class="student-identity has-group-icon">
              <button
                type="button"
                :class="['row-select-toggle', { active: isSelected(student) }]"
                :aria-pressed="isSelected(student)"
                :title="isSelected(student) ? 'Quitar de la selección' : 'Agregar a la selección'"
                @click.stop="$emit('toggle-student-selection', student, $event)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
              </button>
              <StudentGradePhotoCard
                class="student-row-grade-card"
                :student="student"
                :photo-url="activeStudentPhotoUrl(student)"
                :photo-loading="false"
                :is-enrolled="isStudentEnrolled(student, externalConcepts)"
              />
              <span :class="['student-group-sigil', { 'is-missing': studentMissingGroup(student) }]" :title="studentGroupTitle(student)">
                <UiGroupIcon :label="studentGroupLabel(student)" :missing="studentMissingGroup(student)" />
              </span>
              <span class="student-copy">
                <strong
                  :title="student.nombreCompleto"
                  :class="student.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''"
                >
                  {{ student.nombreCompleto }}
                </strong>
                <em class="student-meta">
                  <span>{{ student.matricula }}</span>
                </em>
                <span class="student-type-line">
                  <span :class="['student-tipo-chip', resolvedTipoIngreso(student).value]" :title="resolvedTipoIngreso(student).reason">
                    <component :is="tipoIngresoIcon(student)" :size="11" :stroke-width="2.4" />
                    {{ resolvedTipoIngresoLabel(student) }}
                  </span>
                </span>
                <span v-if="student.customSections?.length" class="student-section-badges" :title="sectionBadgeTitle(student)">
                  <b v-for="section in visibleStudentSections(student)" :key="`row-section-${student.matricula}-${section.id}`">{{ section.name }}</b>
                  <b v-if="hiddenStudentSectionsCount(student)" class="badge-more">+{{ hiddenStudentSectionsCount(student) }}</b>
                </span>
              </span>
            </span>

            <span class="financial-cell">
              <small class="financial-label">Saldo actual</small>
              <strong class="financial-balance" :class="{ danger: student.saldoNeto > 0 }">${{ formatMoney(student.saldoNeto) }}</strong>
            </span>
            <span class="row-actions">
              <button type="button" @click.stop="$emit('select-student', student)" title="Ver estado de cuenta">
                <LucideChevronRight :size="18" />
              </button>
            </span>
          </div>
          <div class="list-footer" aria-live="polite">
            <template v-if="selectedCount > 0">
              <strong>{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
            </template>
            <template v-else>
              <span>{{ displayedStudents.length }} alumnos</span>
            </template>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { LucideBuilding2, LucideChevronRight, LucideClock3, LucideCloudOff, LucideComputer, LucideGlobe2, LucideRotateCcw, LucideTags } from 'lucide-vue-next'
import { formatTipoIngresoValue, resolveTipoIngreso } from '~/shared/utils/tipoIngreso'
import UiGroupIcon from '~/components/ui/UiGroupIcon.vue'
import StudentGradePhotoCard from '~/components/students/StudentGradePhotoCard.vue'
import {
  formatMoney,
  gradeVisualNumber,
  gradeVisualTitle,
  hiddenStudentSectionsCount,
  isStudentEnrolled,
  normalizeStudentMatricula,
  photoStorageKey,
  sectionBadgeTitle,
  studentGroupLabel,
  studentPresentationStyle,
  visibleStudentSections
} from '~/shared/utils/studentPresentation'

const props = defineProps({
  hasAccountWorkspace: { type: Boolean, default: false },
  displayedStudents: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
  selectedMatriculas: { type: Object, default: () => new Set() },
  allDisplayedSelected: { type: Boolean, default: false },
  someDisplayedSelected: { type: Boolean, default: false },
  hasActiveFilters: { type: Boolean, default: false },
  selectedStudent: { type: Object, default: null },
  externalConcepts: { type: Array, default: () => [] },
  targetCiclo: { type: [String, Number], default: '2025' },
  photoCache: { type: Object, default: () => ({}) },
  sourceUnavailable: { type: Boolean, default: false }
})

const localHour = ref(12)
onMounted(() => {
  localHour.value = new Date().getHours()
})
const isAfterOfficeHours = computed(() => localHour.value >= 17)
const sourceUnavailableTitle = computed(() => isAfterOfficeHours.value
  ? 'El equipo del plantel ya cerró por hoy'
  : 'La base del plantel no está disponible en este momento')
const sourceUnavailableMessage = computed(() => isAfterOfficeHours.value
  ? 'La información se consulta desde el equipo local del plantel. Si el administrador ya terminó su jornada, la lista volverá a estar disponible cuando ese equipo se encienda de nuevo.'
  : 'La lista se activa cuando el equipo del administrador del plantel está encendido y conectado. Solicita que lo mantengan disponible y vuelve a intentarlo.')
const sourceUnavailableHint = computed(() => isAfterOfficeHours.value ? 'Fuera de horario' : 'Esperando conexión')

const isSelected = (student) => props.selectedMatriculas.has(normalizeStudentMatricula(student?.matricula))
const resolvedTipoIngreso = (student) => resolveTipoIngreso(student, props.targetCiclo, { enrollmentConcepts: props.externalConcepts })
const resolvedTipoIngresoLabel = (student) => formatTipoIngresoValue(resolvedTipoIngreso(student))
const tipoIngresoIcon = (student) => resolvedTipoIngreso(student).value === 'interno' ? LucideBuilding2 : LucideGlobe2
const studentMissingGroup = (student) => !studentGroupLabel(student)
const studentGroupTitle = (student) => {
  const group = studentGroupLabel(student)
  return group ? `Grupo ${group}` : 'Sin grupo'
}

const activeStudentPhotoUrl = (student) => {
  const matricula = normalizeStudentMatricula(student?.matricula)
  const selectedMatricula = normalizeStudentMatricula(props.selectedStudent?.matricula)
  if (!matricula || matricula !== selectedMatricula) return ''
  const cached = props.photoCache?.[matricula]
  if (cached && cached !== 'none') return cached
  if (process.client) {
    const stored = sessionStorage.getItem(photoStorageKey(matricula))
    if (stored && stored !== 'none') return stored
  }
  return ''
}

defineEmits([
  'open-section-selection',
  'clear-filters',
  'toggle-displayed-selection',
  'toggle-student-selection',
  'student-row-click',
  'select-student',
  'show-student-menu',
  'refresh-source'
])
</script>

<style scoped>

.student-list-scroll.is-source-unavailable {
  position: relative;
  display: flex;
  min-height: 0;
  padding: clamp(10px, 1vw, 14px);
  background: #fff;
  isolation: isolate;
}

.student-list-scroll.is-source-unavailable::before,
.student-list-scroll.is-source-unavailable::after {
  display: none;
}

.student-source-unavailable {
  position: relative;
  display: flex;
  min-height: clamp(360px, 50vh, 540px);
  height: 100%;
  z-index: 5;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(198, 221, 204, 0.9);
  border-radius: 28px;
  background:
    radial-gradient(circle at 20% 18%, rgba(112, 180, 73, 0.16), transparent 12rem),
    radial-gradient(circle at 84% 12%, rgba(0, 126, 148, 0.12), transparent 13rem),
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(247, 252, 248, 0.96));
  padding: 34px 28px;
  text-align: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86), 0 22px 55px rgba(22, 64, 46, 0.08);
}

.student-source-unavailable::before {
  content: '';
  position: absolute;
  z-index: 0;
  width: 280px;
  height: 280px;
  right: -118px;
  bottom: -126px;
  border: 34px solid rgba(47, 125, 56, 0.06);
  border-radius: 999px;
}

.source-orb {
  position: relative;
  z-index: 1;
  display: grid;
  width: 84px;
  height: 84px;
  margin: 0 auto 22px;
  place-items: center;
  border: 1px solid rgba(56, 139, 67, 0.22);
  border-radius: 28px;
  background: linear-gradient(145deg, #ffffff, #ebf8ec);
  color: #2f7d38;
  box-shadow: 0 20px 38px rgba(36, 116, 66, 0.14);
}

.source-orb span {
  position: absolute;
  right: -8px;
  bottom: -6px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 14px;
  background: #0b7891;
  color: white;
  box-shadow: 0 12px 24px rgba(0, 104, 130, 0.22);
}

.source-copy {
  position: relative;
  z-index: 1;
  max-width: 570px;
}

.source-eyebrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(47, 125, 56, 0.14);
  border-radius: 999px;
  background: rgba(235, 248, 236, 0.82);
  padding: 7px 12px;
  color: #2f7d38;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.source-copy h3 {
  margin: 16px 0 10px;
  color: #16213b;
  font-size: clamp(1.25rem, 2.1vw, 1.75rem);
  font-weight: 950;
  letter-spacing: -0.04em;
}

.source-copy p {
  margin: 0 auto;
  color: #64748b;
  font-size: 0.98rem;
  font-weight: 650;
  line-height: 1.65;
}

.source-hints {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.source-hints span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(204, 216, 226, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  padding: 8px 12px;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 800;
}

.source-retry {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #2f8f46, #52b343);
  padding: 12px 18px;
  color: white;
  font-size: 0.9rem;
  font-weight: 900;
  box-shadow: 0 18px 30px rgba(45, 142, 66, 0.22);
  cursor: pointer;
}

.source-retry:hover {
  transform: translateY(-1px);
}
</style>
