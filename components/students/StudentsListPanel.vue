<template>
  <section :class="['student-list-panel', hasAccountWorkspace ? 'is-compact' : 'is-full']">
    <div v-if="sourceUnavailable && !loading" class="student-list-card source-unavailable-card">
      <section class="student-source-unavailable" aria-live="polite">
        <figure class="source-visual" aria-hidden="true">
          <img src="/brand/plantel-offline-visual.png" alt="" />
        </figure>
        <div class="source-copy">
          <span class="source-eyebrow">Conexión local en pausa</span>
          <h3>{{ sourceUnavailableTitle }}</h3>
          <p>{{ sourceUnavailableMessage }}</p>
        </div>
        <div class="source-diagnostic" role="status">
          <LucideInfo :size="17" aria-hidden="true" />
          <span class="source-diagnostic-copy">
            <strong>Motivo detectado</strong>
            <span>{{ sourceUnavailableReason }}</span>
          </span>
          <small v-if="sourceUnavailableReference" class="source-diagnostic-reference">
            Ref. {{ sourceUnavailableReference }}
          </small>
        </div>
        <p class="source-next-step">Reintenta nuevamente o reinicia tu sesión.</p>
        <div class="source-actions">
          <button type="button" class="source-retry" @click="$emit('refresh-source')">
            <LucideRotateCcw :size="16" />
            REINTENTAR
          </button>
          <button type="button" class="source-session-restart" @click="$emit('restart-session')">
            <LucideLogIn :size="16" />
            Reiniciar sesión
          </button>
        </div>
      </section>
    </div>

    <div v-else class="student-list-card">
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
          <figure class="source-visual" aria-hidden="true">
            <img src="/brand/plantel-offline-visual.png" alt="" />
          </figure>
          <div class="source-copy">
            <span class="source-eyebrow">Conexión local en pausa</span>
            <h3>{{ sourceUnavailableTitle }}</h3>
            <p>{{ sourceUnavailableMessage }}</p>
          </div>
          <div class="source-diagnostic" role="status">
            <LucideInfo :size="17" aria-hidden="true" />
            <span class="source-diagnostic-copy">
              <strong>Motivo detectado</strong>
              <span>{{ sourceUnavailableReason }}</span>
            </span>
            <small v-if="sourceUnavailableReference" class="source-diagnostic-reference">
              Ref. {{ sourceUnavailableReference }}
            </small>
          </div>
          <p class="source-next-step">Reintenta nuevamente o reinicia tu sesión.</p>
          <div class="source-actions">
            <button type="button" class="source-retry" @click="$emit('refresh-source')">
              <LucideRotateCcw :size="16" />
              REINTENTAR
            </button>
            <button type="button" class="source-session-restart" @click="$emit('restart-session')">
              <LucideLogIn :size="16" />
              Reiniciar sesión
            </button>
          </div>
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
import { computed } from 'vue'
import { LucideBuilding2, LucideChevronRight, LucideGlobe2, LucideInfo, LucideLogIn, LucideRotateCcw, LucideTags } from 'lucide-vue-next'
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
  tipoIngresoConcepts: { type: Array, default: () => [] },
  targetCiclo: { type: [String, Number], default: '2025' },
  photoCache: { type: Object, default: () => ({}) },
  sourceUnavailable: { type: Boolean, default: false },
  sourceUnavailableCode: { type: String, default: '' },
  sourceUnavailableDetail: { type: String, default: '' }
})

const sourceUnavailableTitle = 'La información del plantel está tardando en responder'
const sourceUnavailableMessage = 'La consulta local se pausó por un momento. Tus datos permanecen sin cambios.'

const sourceUnavailableContext = computed(() => {
  const code = String(props.sourceUnavailableCode || '').trim()
  const detail = String(props.sourceUnavailableDetail || '').trim()
  return String(code || detail).toUpperCase()
})

const sourceUnavailableReason = computed(() => {
  const context = sourceUnavailableContext.value

  if (/AUTH_SESSION|SESSION|SESI[ÓO]N|UNAUTHORIZED|FORBIDDEN|\b401\b|\b403\b/.test(context)) {
    return 'La sesión necesita renovarse antes de volver a consultar la información.'
  }
  if (/MISSING_AGENT|NO DB BRIDGE AGENT|PLANTEL ACTIVO|IDENTIFICAR EL PLANTEL/.test(context)) {
    return 'La sesión no pudo confirmar el plantel activo para esta consulta.'
  }
  if (/TIMEOUT|TIMED OUT|\b504\b|TIEMPO DE ESPERA|TARD[ÓO]/.test(context)) {
    return 'La conexión local tardó más de lo habitual en responder.'
  }
  if (/NETWORK|OFFLINE|UNAVAILABLE|FUERA DE L[ÍI]NEA|\b502\b|\b503\b|CONEXI[ÓO]N/.test(context)) {
    return 'El enlace con el equipo del plantel se interrumpió por un momento.'
  }

  return 'La conexión local no respondió en este intento.'
})

const sourceUnavailableReference = computed(() => {
  const code = String(props.sourceUnavailableCode || '').trim().toUpperCase()
  return /^[A-Z][A-Z0-9_:-]{2,79}$/.test(code) ? code : ''
})

const isSelected = (student) => props.selectedMatriculas.has(normalizeStudentMatricula(student?.matricula))
const resolvedTipoIngreso = (student) => resolveTipoIngreso(student, props.targetCiclo, { enrollmentConcepts: props.tipoIngresoConcepts.length ? props.tipoIngresoConcepts : props.externalConcepts })
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
  'refresh-source',
  'restart-session'
])
</script>

<style scoped>

.source-unavailable-card {
  display: flex;
  min-height: 0;
  overflow: visible;
  padding: clamp(12px, 1.2vw, 18px);
  background: linear-gradient(180deg, #ffffff, #fbfdfb);
}

.source-unavailable-card .student-source-unavailable {
  width: 100%;
  min-height: 100%;
  height: auto;
  flex: 1 1 auto;
}

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
  width: 100%;
  min-height: clamp(340px, 48vh, 500px);
  height: auto;
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
  padding: clamp(18px, 3vw, 30px) 28px;
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

.source-visual {
  position: relative;
  z-index: 1;
  width: min(72%, 280px);
  margin: -12px auto 0;
}

.source-visual img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 22px 32px rgba(27, 99, 85, 0.12));
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
  margin: 12px 0 8px;
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
  line-height: 1.55;
}

.source-diagnostic {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, 620px);
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  border: 1px solid rgba(184, 214, 195, 0.92);
  border-radius: 16px;
  background: rgba(244, 251, 246, 0.9);
  padding: 11px 13px;
  color: #475569;
  font-size: 0.82rem;
  line-height: 1.45;
  text-align: left;
}

.source-diagnostic > svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: #2f7d38;
}

.source-diagnostic-copy {
  display: grid;
  flex: 1 1 auto;
  gap: 1px;
}

.source-diagnostic-copy strong {
  color: #244a31;
  font-size: 0.78rem;
  font-weight: 900;
}

.source-diagnostic-reference {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  padding: 3px 7px;
  color: #64748b;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.source-next-step {
  position: relative;
  z-index: 1;
  margin: 13px 0 0;
  color: #475569;
  font-size: 0.86rem;
  font-weight: 750;
}

.source-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
}

.source-retry,
.source-session-restart {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  padding: 11px 17px;
  font-size: 0.9rem;
  font-weight: 900;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.source-retry {
  border: 0;
  background: linear-gradient(135deg, #2f8f46, #52b343);
  color: white;
  box-shadow: 0 18px 30px rgba(45, 142, 66, 0.22);
}

.source-session-restart {
  border: 1px solid rgba(82, 112, 126, 0.24);
  background: rgba(255, 255, 255, 0.88);
  color: #34495e;
  box-shadow: 0 12px 24px rgba(32, 63, 78, 0.08);
}

.source-retry:hover,
.source-session-restart:hover {
  transform: translateY(-1px);
}

.source-retry:focus-visible,
.source-session-restart:focus-visible {
  outline: 3px solid rgba(47, 143, 70, 0.24);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .student-source-unavailable {
    padding-inline: 18px;
  }

  .source-visual {
    width: min(78%, 230px);
  }

  .source-diagnostic {
    flex-wrap: wrap;
  }

  .source-diagnostic-reference {
    margin-left: 27px;
  }

  .source-actions {
    width: min(100%, 360px);
  }

  .source-retry,
  .source-session-restart {
    flex: 1 1 150px;
  }
}

@media (max-height: 620px) and (min-width: 641px) {
  .student-source-unavailable {
    min-height: 320px;
    padding-block: 14px;
  }

  .source-visual {
    width: min(58%, 205px);
    margin-top: -14px;
  }

  .source-copy h3 {
    margin-block: 8px 5px;
    font-size: clamp(1.1rem, 1.8vw, 1.45rem);
  }

  .source-copy p {
    font-size: 0.9rem;
  }

  .source-diagnostic {
    margin-top: 10px;
    padding-block: 8px;
  }

  .source-next-step,
  .source-actions {
    margin-top: 9px;
  }

  .source-retry,
  .source-session-restart {
    padding-block: 9px;
  }
}
</style>
