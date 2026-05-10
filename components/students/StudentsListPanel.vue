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

      <div class="student-list-scroll">
        <div v-if="loading" class="empty-state loading-state">
          <span class="liquid-loader" aria-hidden="true"><i></i><i></i><i></i></span>
          Cargando estudiantes...
        </div>
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
            <span class="student-identity">
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
              <span class="student-grade-mark" :style="studentPresentationStyle(student)" :title="gradeVisualTitle(student)">
                <span class="student-grade-number">{{ gradeVisualNumber(student) }}</span>
                <span class="student-grade-label">grado</span>
                <span v-if="studentGroupLabel(student)" class="student-grade-group">{{ studentGroupLabel(student) }}</span>
              </span>
              <span v-if="studentGroupLabel(student)" class="student-group-sigil" :title="studentGroupLabel(student)">
                <UiGroupIcon :label="studentGroupLabel(student)" />
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
import { LucideChevronRight, LucideRotateCcw, LucideTags } from 'lucide-vue-next'
import UiGroupIcon from '~/components/ui/UiGroupIcon.vue'
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
  externalConcepts: { type: Array, default: () => [] }
})

const isSelected = (student) => props.selectedMatriculas.has(normalizeStudentMatricula(student?.matricula))

defineEmits([
  'open-section-selection',
  'clear-filters',
  'toggle-displayed-selection',
  'toggle-student-selection',
  'student-row-click',
  'select-student',
  'show-student-menu'
])
</script>
