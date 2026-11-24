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

      <div ref="listScroll" :class="['student-list-scroll', { 'is-source-unavailable': sourceUnavailable }]">
        <div v-if="loading" class="empty-state loading-state">
          <span class="liquid-loader" aria-hidden="true"><i></i><i></i><i></i></span>
          Cargando estudiantes...
        </div>
        <section v-else-if="sourceUnavailable" class="student-source-unavailable">
          <figure class="source-visual" aria-hidden="true">
            <img src="/brand/plantel-offline-visual.png" alt="" />
          </figure>

          <div class="source-copy" role="status">
            <h3>Por favor habilita los servicios locales</h3>
          </div>

          <time v-if="sourceTimestamp" class="source-timestamp" :datetime="sourceTimestamp.toISOString()">
            {{ sourceTimestampFormatter.format(sourceTimestamp) }}
          </time>

          <div class="source-actions">
            <button type="button" class="source-retry" @click="retryNow">
              <LucideRotateCcw :size="16" />
              Reintentar ahora
            </button>
            <a
              class="source-contingency"
              href="http://localhost/Sistema%20de%20ingresos/login.php"
              target="_blank"
              rel="noopener"
            >
              <LucideExternalLink :size="16" />
              Sistema de Contingencia
            </a>
          </div>
        </section>
        <div v-else-if="!displayedStudents.length" class="empty-state muted">No hay registros bajo los filtros actuales.</div>
        <template v-else>
          <div
            v-for="student in displayedStudents"
            :key="student.matricula"
            :ref="element => observeStudentRow(element, student)"
            :data-matricula="student.matricula"
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
                  class="student-name"
                  :title="student.nombreCompleto"
                  :class="student.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''"
                >
                  {{ student.nombreCompleto }}
                </strong>
                <span class="student-meta-line">
                  <em class="student-matricula-chip">
                    <span>{{ student.matricula }}</span>
                  </em>

                  <span class="student-type-line">
                    <span :class="['student-tipo-chip', resolvedTipoIngreso(student).value]" :title="resolvedTipoIngreso(student).reason">
                      <component :is="tipoIngresoIcon(student)" :size="11" :stroke-width="2.4" />
                      {{ resolvedTipoIngresoLabel(student) }}
                    </span>
                  </span>
                  <span class="student-academic-line">{{ studentGroupLabel(student) }}</span>
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadStudentPhoto, readStudentPhoto } from '~/utils/studentPhotos'
import { LucideBuilding2, LucideChevronRight, LucideExternalLink, LucideGlobe2, LucideRotateCcw, LucideTags } from 'lucide-vue-next'
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

const emit = defineEmits([
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

const sourceTimestamp = ref(null)
const sourceTimestampFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'long',
  timeStyle: 'medium',
  hourCycle: 'h23'
})

const RETRY_INTERVAL_SECONDS = 20
const retryCountdown = ref(RETRY_INTERVAL_SECONDS)
let retryTimer = null

const stopAutoRetry = () => {
  if (retryTimer) clearInterval(retryTimer)
  retryTimer = null
  sourceTimestamp.value = null
}

const startAutoRetry = () => {
  stopAutoRetry()
  retryCountdown.value = RETRY_INTERVAL_SECONDS
  if (!process.client) return

  sourceTimestamp.value = new Date()
  retryTimer = window.setInterval(() => {
    sourceTimestamp.value = new Date()
    retryCountdown.value -= 1
    if (retryCountdown.value > 0) return

    retryCountdown.value = RETRY_INTERVAL_SECONDS
    emit('refresh-source')
  }, 1000)
}

const retryNow = () => {
  retryCountdown.value = RETRY_INTERVAL_SECONDS
  emit('refresh-source')
}

watch(
  () => props.sourceUnavailable,
  (unavailable) => {
    if (unavailable) startAutoRetry()
    else stopAutoRetry()
  }
)

onMounted(() => {
  if (props.sourceUnavailable) startAutoRetry()
})

onBeforeUnmount(stopAutoRetry)

const isSelected = (student) => props.selectedMatriculas.has(normalizeStudentMatricula(student?.matricula))
const resolvedTipoIngreso = (student) => resolveTipoIngreso(student, props.targetCiclo, { enrollmentConcepts: props.tipoIngresoConcepts.length ? props.tipoIngresoConcepts : props.externalConcepts })
const resolvedTipoIngresoLabel = (student) => formatTipoIngresoValue(resolvedTipoIngreso(student))
const tipoIngresoIcon = (student) => resolvedTipoIngreso(student).value === 'interno' ? LucideBuilding2 : LucideGlobe2
const studentMissingGroup = (student) => !studentGroupLabel(student)
const studentGroupTitle = (student) => {
  const group = studentGroupLabel(student)
  return group ? `Grupo ${group}` : 'Sin grupo'
}



const rowPhotos = ref({})
const listScroll = ref(null)
const rows = new Map()
const attempts = new Map()
const visibleRows = new Set()
const pendingPhotos = new Set()
const retryTimers = new Map()
let photoObserver
let disposed = false

function loadVisiblePhoto(matricula) {
  const student = props.displayedStudents.find(row => normalizeStudentMatricula(row.matricula) === matricula)
  if (disposed || !student || activeStudentPhotoUrl(student) || pendingPhotos.has(matricula) || retryTimers.has(matricula)) return
  const attempt = attempts.get(matricula) || 0
  if (attempt >= 4) return
  attempts.set(matricula, attempt + 1)
  pendingPhotos.add(matricula)
  loadStudentPhoto(matricula).then(photo => {
    if (!disposed) rowPhotos.value[matricula] = photo || 'none'
  }).catch(() => {
    // A temporary source/auth/network failure must recover without a scroll.
    if (disposed || attempt >= 3) return
    retryTimers.set(matricula, setTimeout(() => {
      retryTimers.delete(matricula)
      loadVisiblePhoto(matricula)
    }, [4000, 12000, 30000][attempt]))
  }).finally(() => pendingPhotos.delete(matricula))
}

function observeStudentRow(element, student) {
  const matricula = normalizeStudentMatricula(student?.matricula)
  const previous = rows.get(matricula)
  if (previous === element) return
  if (previous) photoObserver?.unobserve(previous)
  if (element) {
    rows.set(matricula, element)
    photoObserver?.observe(element)
  } else {
    rows.delete(matricula)
    visibleRows.delete(matricula)
  }
}

// Prime the first screen independently of observer geometry. Keep the rest lazy
// so a large financial list does not issue a photo query for every student.
watch(() => props.displayedStudents, students => {
  if (import.meta.client) for (const student of students.slice(0, 16)) loadVisiblePhoto(normalizeStudentMatricula(student.matricula))
}, { immediate: true, deep: false })

onMounted(() => {
  for (const student of props.displayedStudents.slice(0, 16)) loadVisiblePhoto(normalizeStudentMatricula(student.matricula))
  photoObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const matricula = normalizeStudentMatricula(entry.target.dataset.matricula)
      if (!entry.isIntersecting) { visibleRows.delete(matricula); continue }
      visibleRows.add(matricula)
      loadVisiblePhoto(matricula)
    }
  }, { root: listScroll.value, threshold: 0.01 })
  for (const element of rows.values()) photoObserver.observe(element)
})

onBeforeUnmount(() => {
  disposed = true
  photoObserver?.disconnect()
  rows.clear()
  visibleRows.clear()
  for (const timer of retryTimers.values()) clearTimeout(timer)
  retryTimers.clear()
})

function activeStudentPhotoUrl(student) {
  const matricula = normalizeStudentMatricula(student?.matricula)
  if (!matricula) return ''
  const cached = props.photoCache?.[matricula]
  if (cached && cached !== 'none') return cached
  const loaded = rowPhotos.value[matricula]
  if (loaded && loaded !== 'none') return loaded
  const stored = readStudentPhoto(matricula)
  if (stored) return stored
  return student?.photoUrl && student.photoUrl !== 'none' ? student.photoUrl : ''
}
</script>

<style scoped>
.student-list-scroll.is-source-unavailable {
  position: relative;
  display: flex;
  min-height: clamp(360px, 54vh, 560px);
  align-items: stretch;
  justify-content: center;
  padding: clamp(12px, 1.5vw, 20px);
  background: #fff;
}

.student-source-unavailable {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(198, 221, 204, 0.9);
  border-radius: 26px;
  background:
    radial-gradient(circle at 20% 18%, rgba(112, 180, 73, 0.16), transparent 12rem),
    radial-gradient(circle at 84% 12%, rgba(0, 126, 148, 0.12), transparent 13rem),
    linear-gradient(145deg, rgba(255, 255, 255, 0.99), rgba(247, 252, 248, 0.97));
  padding: clamp(24px, 3vw, 38px) clamp(18px, 4vw, 52px);
  text-align: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 22px 55px rgba(22, 64, 46, 0.08);
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
  width: min(48%, 180px);
  margin: 0 auto 6px;
}

.source-visual img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 18px 28px rgba(27, 99, 85, 0.12));
}

.source-copy {
  position: relative;
  z-index: 1;
  max-width: 720px;
}

.source-copy h3 {
  margin: 8px 0 0;
  color: #16213b;
  font-size: clamp(1.55rem, 2.8vw, 2.35rem);
  font-weight: 950;
  letter-spacing: -0.045em;
  line-height: 1.08;
}

.source-timestamp {
  position: relative;
  z-index: 1;
  display: block;
  max-width: 100%;
  margin-top: 16px;
  border: 1px solid rgba(47, 125, 56, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  padding: 10px 14px;
  color: #40566b;
  font-size: 0.92rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.source-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
}

.source-retry,
.source-contingency {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 13px;
  padding: 0 16px;
  font-size: 0.88rem;
  font-weight: 900;
  text-decoration: none;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease, border-color 150ms ease;
}

.source-retry {
  border: 0;
  background: var(--action-primary);
  color: #fff;
  box-shadow: 0 16px 28px rgba(45, 142, 66, 0.2);
}

.source-contingency {
  border: 1px solid rgba(82, 112, 126, 0.24);
  background: rgba(255, 255, 255, 0.9);
  color: #34495e;
  box-shadow: 0 10px 22px rgba(32, 63, 78, 0.07);
}

.source-retry:hover,
.source-contingency:hover {
  transform: translateY(-1px);
}

.source-contingency:hover {
  border-color: rgba(47, 125, 56, 0.28);
  background: #fff;
}

.source-retry:focus-visible,
.source-contingency:focus-visible {
  outline: 3px solid rgba(47, 143, 70, 0.22);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .student-list-scroll.is-source-unavailable {
    min-height: 420px;
    padding: 10px;
  }

  .student-source-unavailable {
    border-radius: 20px;
    padding: 24px 18px;
  }

  .source-visual {
    width: min(60%, 160px);
  }

  .source-copy h3 {
    font-size: clamp(1.4rem, 8vw, 1.85rem);
  }

  .source-actions {
    width: min(100%, 360px);
  }

  .source-retry,
  .source-contingency {
    width: 100%;
  }
}
</style>
