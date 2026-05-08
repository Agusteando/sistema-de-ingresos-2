<template>
  <div class="students-screen">
    <header class="students-hero">
      <div class="hero-copy">
        <h1>Gestión de Alumnos</h1>
        <p>Administración general de matrícula y estado de cuenta financiero.</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-secondary section-manage-button" @click="openSectionModal(null)">
          <LucideTags :size="18"/> Secciones
        </button>
        <button class="btn btn-primary new-student-button" @click="openAlta">
          <LucideUserPlus :size="22"/> Nuevo Alumno
        </button>
      </div>
    </header>

    <section :class="['kpi-summary-system', { 'without-income': userRole !== 'global' }]" aria-label="Resumen de matrícula y finanzas">
      <div class="kpi-cluster" aria-label="Matrícula">
        <div class="kpi-cluster-header">
          <span>Matrícula</span>
          <i aria-hidden="true"></i>
        </div>
        <div class="kpi-grid">
      <button
        @click="setActiveFilter('inscritos')"
        :class="['kpi-card kpi-green', { active: activeFilter === 'inscritos' }]"
      >
        <span class="kpi-icon"><LucideUsers :size="24" /></span>
        <span class="kpi-text">
          <span>Inscritos</span>
          <strong>{{ kpiCounts.inscritos }}</strong>
          <em>Alumnos activos</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,34 15,27 31,29 46,18 63,21 78,13 93,15 104,4" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('internos')"
        :class="['kpi-card kpi-teal', { active: activeFilter === 'internos' }]"
      >
        <span class="kpi-icon"><LucideUserCheck :size="24" /></span>
        <span class="kpi-text">
          <span>Internos</span>
          <strong>{{ kpiCounts.internos }}</strong>
          <em>Alumnos</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,35 18,31 35,22 51,16 69,18 88,15 104,3" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('externos')"
        :class="['kpi-card kpi-blue', { active: activeFilter === 'externos' }]"
      >
        <span class="kpi-icon"><LucideGlobe2 :size="24" /></span>
        <span class="kpi-text">
          <span>Externos</span>
          <strong>{{ kpiCounts.externos }}</strong>
          <em>Alumnos</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,34 15,28 28,30 43,19 56,20 72,9 87,12 104,2" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('no_inscritos')"
        :class="['kpi-card kpi-red', { active: activeFilter === 'no_inscritos' }]"
      >
        <span class="kpi-icon"><LucideUserX :size="24" /></span>
        <span class="kpi-text">
          <span>No inscritos</span>
          <strong>{{ kpiCounts.no_inscritos }}</strong>
          <em>Activos sin inscripcion</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,35 14,29 29,30 43,19 57,16 72,23 88,15 104,4" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('bajas')"
        :class="['kpi-card kpi-gray', { active: activeFilter === 'bajas' }]"
      >
        <span class="kpi-icon"><LucideUserX :size="24" /></span>
        <span class="kpi-text">
          <span>Bajas</span>
          <strong>{{ kpiCounts.bajas }}</strong>
          <em>Con motivo registrado</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,34 16,31 31,23 47,26 63,17 80,19 96,10 104,8" />
        </svg>
      </button>


        </div>

        <div v-if="customSections.length" class="section-kpi-rail" aria-label="Secciones personalizadas">
          <button
            v-for="section in customSections"
            :key="`section-kpi-${section.id}`"
            @click="setActiveFilter(sectionFilterKey(section.id))"
            :class="['section-kpi-card', { active: activeFilter === sectionFilterKey(section.id) }]"
          >
            <span class="section-kpi-icon"><LucideTag :size="14" /></span>
            <span class="section-kpi-name">{{ section.name }}</span>
            <strong>{{ customSectionCounts[section.id] || 0 }}</strong>
          </button>
        </div>
      </div>

      <div v-if="userRole === 'global'" class="monthly-income kpi-income-card" aria-label="Ingresos del mes">
        <div>
          <span>Ingresos del mes</span>
          <strong>${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</strong>
        </div>
        <svg viewBox="0 0 122 42" aria-hidden="true">
          <polyline points="2,34 22,25 40,29 58,18 78,23 96,13 116,5" />
        </svg>
      </div>
    </section>

    <div class="filter-bar">
      <div class="search-control">
        <LucideSearch :size="19" />
        <input
          v-model="filters.q"
          @keyup.enter="performSearch"
          placeholder="Matrícula o nombre del alumno..."
        />
      </div>

      <div class="grade-filter">
        <div class="grade-tabs" aria-label="Filtrar por grado">
          <button @click="activeGrado = ''; activeGrupo = ''; activeSaldoFilter = 'all'" class="chip" :class="{'active': activeGrado === '' && activeSaldoFilter === 'all'}">Todos</button>
          <button type="button" class="chip chip-debt" :class="{ active: activeSaldoFilter === 'debt' }" @click="toggleSaldoDebtFilter">
            <span>Con adeudo</span><i aria-hidden="true"></i>
          </button>
          <button v-for="g in availableGrados" :key="g" @click="activeGrado = g; activeGrupo = ''" class="chip" :class="{'active': activeGrado === g}">{{ g }}</button>
        </div>

        <Transition name="filter-groups">
          <div v-if="activeGrado && availableGrupos.length" class="group-tabs" aria-label="Filtrar por grupo">
            <button @click="activeGrupo = ''" class="chip" :class="{'active-group': activeGrupo === ''}">Todos los grupos</button>
            <button v-for="grp in availableGrupos" :key="grp" @click="activeGrupo = grp" class="chip" :class="{'active-group': activeGrupo === grp}">Grupo {{ grp }}</button>
          </div>
        </Transition>
      </div>

      <button class="btn btn-secondary export-button" @click="exportData">
        <LucideDownload :size="18"/> Exportar
      </button>
    </div>


    <div v-if="selectedFilterTags.length" class="active-filter-strip">
      <span v-for="tag in selectedFilterTags" :key="tag" class="filter-token">{{ tag }}</span>
    </div>

    <div ref="studentsScaleShell" class="students-scale-shell" :style="studentsScaleShellStyle">
      <div class="students-design-canvas" :style="studentsDesignCanvasStyle">
        <div :class="['students-workspace', { 'has-detail': hasAccountWorkspace }]">
      <section :class="['student-list-panel', hasAccountWorkspace ? 'is-compact' : 'is-full']">
        <div class="student-list-card">
          <div class="list-titlebar">
            <div class="list-heading">
              <div class="list-heading-copy">
                <h2>Alumnos <span>{{ displayedStudents.length }}</span></h2>
              </div>
            </div>
            <div class="list-title-actions">
              <button v-if="selectedCount > 0" type="button" class="title-action-pill" title="Asignar sección" @click="openSectionModalForSelection">
                <LucideTags :size="14" />
                <span>Sección</span>
              </button>
              <button v-if="hasActiveFilters" type="button" aria-label="Limpiar filtros" title="Limpiar filtros" @click="clearFilters">
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
              @click="toggleDisplayedSelection"
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
            <div
              v-else
              v-for="s in displayedStudents"
              :key="s.matricula"
              role="button"
              tabindex="0"
              :style="gradeAccentStyle(s)"
              @click="handleStudentRowClick(s, $event)"
              @keydown.enter.prevent="handleStudentRowClick(s, $event)"
              @keydown.space.prevent="toggleStudentSelection(s, $event)"
              @contextmenu.prevent="showStudentMenu($event, s)"
              :class="[
                'student-row',
                hasAccountWorkspace ? 'compact' : 'full',
                selectedStudent?.matricula === s.matricula ? 'selected' : '',
                isStudentSelected(s) ? 'multi-selected' : '',
                s.customSections?.length ? 'has-sections' : '',
                s.estatus !== 'Activo' ? 'inactive' : (!isEnrolled(s) ? 'unenrolled' : '')
              ]"
            >
              <span class="student-identity">
                <button
                  type="button"
                  :class="['row-select-toggle', { active: isStudentSelected(s) }]"
                  :aria-pressed="isStudentSelected(s)"
                  :title="isStudentSelected(s) ? 'Quitar de la selección' : 'Agregar a la selección'"
                  @click.stop="toggleStudentSelection(s, $event)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M5 12.5l4.2 4.2L19 7" />
                  </svg>
                </button>
                <span class="student-grade-mark" :style="gradeAccentStyle(s)" :title="gradeVisualTitle(s)">
                  <span class="student-grade-number">{{ gradeVisualNumber(s) }}</span>
                  <span class="student-grade-label">grado</span>
                </span>
                <span class="student-copy">
                  <strong
                    :title="s.nombreCompleto"
                    :class="s.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''"
                  >
                    {{ s.nombreCompleto }}
                  </strong>
                  <em class="student-meta">
                    <span>{{ s.matricula }}</span>
                    <small v-if="studentGroupLabel(s)" class="group-chip" :aria-label="'Grupo '+ studentGroupLabel(s)">{{ studentGroupLabel(s) }}</small>
                  </em>
                  <span v-if="s.customSections?.length" class="student-section-badges" :title="sectionBadgeTitle(s)">
                    <b v-for="section in visibleStudentSections(s)" :key="`row-section-${s.matricula}-${section.id}`">{{ section.name }}</b>
                    <b v-if="hiddenStudentSectionsCount(s)" class="badge-more">+{{ hiddenStudentSectionsCount(s) }}</b>
                  </span>
                </span>
              </span>

              <span class="financial-cell">
                <small class="financial-label">Saldo actual</small>
                <strong class="financial-balance" :class="{ danger: s.saldoNeto > 0 }">${{ format(s.saldoNeto) }}</strong>
              </span>
              <span class="row-actions">
                <button type="button" @click.stop="selectStudent(s)" title="Ver estado de cuenta">
                  <LucideChevronRight :size="18" />
                </button>
              </span>
            </div>
          </div>

          <div :class="['list-footer', { 'selection-footer': selectedCount > 0 }]">
            <template v-if="selectedCount > 0">
              <div class="selection-inline-summary">
                <div class="selection-inline-copy">
                  <strong>{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
                </div>
                <div class="selection-inline-totals">
                  <span>Total: ${{ format(selectedBalanceTotal) }}</span>
                </div>
              </div>
            </template>
            <template v-else>
              <span>{{ listRangeLabel }}</span>
            </template>
          </div>
        </div>
      </section>

      <Transition name="detail-flow" mode="out-in">
      <section v-if="accountWorkspaceMode === 'detail' && selectedStudent" :key="`detail-${selectedStudent.matricula}`" class="student-detail-panel">
        <StudentDetails
          :student="selectedStudent"
          :is-enrolled="isEnrolled(selectedStudent)"
          @refresh="performSearch"
          @edit="openEdit"
          @close="selectedStudent = null"
          @switch-student="selectStudentByMatricula"
          @photo-loaded="cacheStudentPhoto"
          @baja="bajaAlumno"
          @manage-sections="openSectionModal"
        />
      </section>

      <section v-else-if="accountWorkspaceMode === 'bulk'" key="bulk-overview" class="student-detail-panel bulk-workspace-panel">
        <div class="bulk-workspace-card">
          <header class="bulk-workspace-header">
            <div>
              <span>Procesar selección</span>
              <h2>{{ selectedCount }} alumnos</h2>
              <p>{{ selectedGradeSummary }}<template v-if="selectedGroupSummary"> · {{ selectedGroupSummary }}</template></p>
            </div>
            <button type="button" class="plain-icon-button" title="Cerrar selección" @click="closeBulkWorkspace"><LucideX :size="18" /></button>
          </header>

          <div class="bulk-metric-grid">
            <article>
              <small>Saldo total</small>
              <strong>${{ format(selectedBalanceTotal) }}</strong>
            </article>
            <article>
              <small>Promedio</small>
              <strong>${{ format(selectedAverageBalance) }}</strong>
            </article>
            <article>
              <small>Secciones</small>
              <strong>{{ selectedSectionSummary }}</strong>
            </article>
          </div>

          <div class="bulk-command-row">
            <button type="button" class="bulk-command primary" @click="openBulkPaymentFlow">
              <LucideCreditCard :size="18" />
              <span>Pagar selección</span>
            </button>
            <button type="button" class="bulk-command" @click="openSectionModalForSelection">
              <LucideTags :size="18" />
              <span>Asignar secciones</span>
            </button>
            <button type="button" class="bulk-command" @click="clearSelectedStudents">
              <LucideX :size="18" />
              <span>Limpiar</span>
            </button>
          </div>

          <div class="bulk-selected-list">
            <article v-for="student in selectedStudents" :key="`bulk-student-${student.matricula}`" :style="gradeAccentStyle(student)">
              <span class="bulk-grade">{{ gradeVisualNumber(student) }}</span>
              <div>
                <strong>{{ student.nombreCompleto }}</strong>
                <small>{{ student.matricula }}<template v-if="studentGroupLabel(student)"> · {{ studentGroupLabel(student) }}</template></small>
              </div>
              <b>${{ format(student.saldoNeto) }}</b>
            </article>
          </div>
        </div>
      </section>

      <section v-else-if="accountWorkspaceMode === 'bulk-payment'" key="bulk-payment" class="student-detail-panel bulk-workspace-panel bulk-payment-panel">
        <div class="bulk-workspace-card">
          <header class="bulk-workspace-header">
            <div>
              <span>Pago múltiple</span>
              <h2>{{ selectedCount }} alumnos seleccionados</h2>
              <p>Revisa montos antes de registrar. Se genera un pago por alumno.</p>
            </div>
            <button type="button" class="plain-icon-button" title="Cerrar pago múltiple" @click="bulkWorkspaceMode = 'bulk'"><LucideX :size="18" /></button>
          </header>

          <div class="bulk-payment-controls">
            <label>
              <span>Estrategia</span>
              <select v-model="bulkPaymentStrategy">
                <option value="balance">Pagar saldo de cada alumno</option>
                <option value="same">Mismo monto por alumno</option>
                <option value="total">Distribuir monto total</option>
              </select>
            </label>
            <label v-if="bulkPaymentStrategy !== 'balance'">
              <span>{{ bulkPaymentStrategy === 'same' ? 'Monto por alumno' : 'Monto total' }}</span>
              <input v-model.number="bulkPaymentAmount" type="number" min="0" step="0.01" />
            </label>
            <label>
              <span>Forma de pago</span>
              <select v-model="bulkPaymentMethod">
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta de débito">Tarjeta de Débito</option>
                <option value="Tarjeta de crédito">Tarjeta de Crédito</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Cheque">Cheque</option>
              </select>
            </label>
          </div>

          <div class="bulk-payment-summary">
            <article>
              <small>Total a registrar</small>
              <strong>${{ format(bulkPaymentTotal) }}</strong>
            </article>
            <article>
              <small>Alumnos con pago</small>
              <strong>{{ bulkPaymentStudentCount }}</strong>
            </article>
            <article>
              <small>Conceptos cargados</small>
              <strong>{{ bulkPaymentDebtCount }}</strong>
            </article>
          </div>

          <div class="bulk-payment-table-wrap">
            <table class="bulk-payment-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th class="money-cell">Saldo</th>
                  <th class="money-cell">Pago</th>
                  <th class="money-cell">Después</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="bulkPaymentLoading">
                  <td colspan="4" class="bulk-empty">Cargando adeudos...</td>
                </tr>
                <tr v-else v-for="item in bulkPaymentPlan" :key="`bulk-payment-${item.student.matricula}`">
                  <td>
                    <strong>{{ item.student.nombreCompleto }}</strong>
                    <small>{{ item.student.matricula }}</small>
                  </td>
                  <td class="money-cell">${{ format(item.balance) }}</td>
                  <td class="money-cell paid">${{ format(item.amount) }}</td>
                  <td class="money-cell" :class="{ danger: item.after > 0 }">${{ format(item.after) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="bulk-payment-actions">
            <button type="button" class="btn btn-secondary" :disabled="bulkPaymentProcessing" @click="bulkWorkspaceMode = 'bulk'">Volver</button>
            <button type="button" class="btn btn-primary" :disabled="bulkPaymentProcessing || bulkPaymentTotal <= 0 || bulkPaymentLoading" @click="submitBulkPayments">
              <LucideCreditCard :size="16" /> {{ bulkPaymentProcessing ? 'Registrando...' : 'Registrar pagos' }}
            </button>
          </div>
        </div>
      </section>
      </Transition>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="selection-dock">
        <div v-if="selectedCount > 0" class="selection-action-dock">
          <div class="selection-action-dock__summary">
            <div class="selection-action-dock__count">{{ selectedCount }}</div>
            <div class="selection-action-dock__copy">
              <strong>{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
              <span>${{ format(selectedBalanceTotal) }} total</span>
            </div>
          </div>
          <div class="selection-action-dock__actions">
            <button type="button" class="dock-action secondary" @click="openSelectionDetails">
              <span>Estado de cuenta</span>
              <LucideArrowRight :size="16" />
            </button>
            <button type="button" class="dock-action secondary" @click="openSectionModalForSelection">
              <LucideTags :size="16" />
              <span>Secciones</span>
            </button>
            <button type="button" class="dock-action primary" @click="openBulkPaymentFlow">
              <LucideCreditCard :size="16" />
              <span>Aplicar pago</span>
            </button>
            <button type="button" class="dock-action ghost" @click="clearSelectedStudents">Limpiar</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
    <BajaReasonModal v-if="pendingBajaStudent" :student="pendingBajaStudent" @close="pendingBajaStudent = null" @confirm="confirmBaja" />

    <Teleport to="body">
      <div v-if="showSectionModal" class="section-modal-backdrop" @click.self="closeSectionModal">
        <div class="section-modal-card">
          <header>
            <div>
              <span>Secciones personalizadas</span>
              <h3 v-if="sectionModalStudent">{{ sectionModalStudent.nombreCompleto }}</h3>
              <h3 v-else-if="sectionModalStudents.length">{{ sectionModalStudents.length }} alumnos seleccionados</h3>
              <h3 v-else>Administrar secciones</h3>
            </div>
            <button type="button" class="plain-icon-button" @click="closeSectionModal"><LucideX :size="18" /></button>
          </header>

          <div class="section-create-row">
            <input v-model="newSectionName" placeholder="Nueva seccion local..." @keyup.enter="createCustomSection" />
            <button class="btn btn-primary btn-sm" :disabled="creatingSection || !newSectionName.trim()" @click="createCustomSection">
              <LucidePlus :size="14" /> Crear
            </button>
          </div>

          <div v-if="!customSections.length" class="section-empty-state">Aun no hay secciones personalizadas.</div>
          <div v-else class="section-option-list">
            <label v-for="section in customSections" :key="`section-option-${section.id}`" class="section-option">
              <span>
                <strong>{{ section.name }}</strong>
                <em>{{ customSectionCounts[section.id] || 0 }} alumnos</em>
              </span>
              <input
                v-if="sectionModalStudent"
                type="checkbox"
                :checked="studentHasSection(sectionModalStudent, section.id)"
                :disabled="assigningSections"
                @change="toggleStudentSection(sectionModalStudent, section.id, $event.target.checked)"
              />
              <button
                v-else-if="sectionModalStudents.length"
                type="button"
                :class="['section-check', bulkSectionState(section.id)]"
                :disabled="assigningSections"
                :title="bulkSectionState(section.id) === 'all' ? 'Quitar de la selección' : 'Agregar a la selección'"
                @click="toggleBulkSection(section)"
              ><span></span></button>
              <button v-else type="button" class="section-delete" title="Eliminar seccion" @click.prevent="deleteCustomSection(section)">
                <LucideTrash2 :size="14" />
              </button>
            </label>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import {
  LucideSearch,
  LucideUserPlus,
  LucideDownload,
  LucideEdit2,
  LucideUserX,
  LucideUserCheck,
  LucideEye,
  LucideSettings,
  LucideUsers,
  LucideGlobe2,
  LucideRotateCcw,
  LucideChevronRight,
  LucideTags,
  LucideTag,
  LucideX,
  LucidePlus,
  LucideTrash2,
  LucideCreditCard,
  LucideArrowRight
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { exportToCSV } from '~/utils/export'
import { GRADOS_ORDEN } from '~/utils/constants'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'
import BajaReasonModal from '~/components/BajaReasonModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const route = useRoute()
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
const studentsScaleShell = ref(null)
const workspaceScale = ref(1)
const workspaceCanvasHeight = ref(640)
const workspaceCanvasWidth = ref(760)
const selectedMatriculas = ref(new Set())
const lastSelectedMatricula = ref(null)
const photoCache = ref({})

const globalKpis = ref({ ingresosMes: 0 })
const showStudentModal = ref(false)
const editingStudent = ref(null)
const pendingBajaStudent = ref(null)
const customSections = ref([])
const showSectionModal = ref(false)
const sectionModalStudent = ref(null)
const sectionModalMatriculas = ref([])
const newSectionName = ref('')
const creatingSection = ref(false)
const assigningSections = ref(false)
const bulkWorkspaceMode = ref('none')
const bulkPaymentStrategy = ref('balance')
const bulkPaymentAmount = ref(0)
const bulkPaymentMethod = ref('Efectivo')
const bulkPaymentLoading = ref(false)
const bulkPaymentProcessing = ref(false)
const bulkPaymentDebts = ref({})

const format = (val) => Number(val || 0).toFixed(2)
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AL'
const normalizeStudentMatricula = (value) => String(value || '').trim().toUpperCase()
const photoStorageKey = (matricula) => `foto_${normalizeStudentMatricula(matricula)}`
const sectionFilterKey = (id) => `section:${Number(id)}`
const isSectionFilter = (filter) => String(filter || '').startsWith('section:')
const sectionIdFromFilter = (filter) => Number(String(filter || '').split(':')[1] || 0)
const normalizeSectionIds = (sections = []) => sections.map(section => Number(section.id)).filter(Boolean)
const studentHasSection = (student, sectionId) => normalizeSectionIds(student?.customSections || []).includes(Number(sectionId))
const visibleStudentSections = (student) => (student?.customSections || []).slice(0, 1)
const hiddenStudentSectionsCount = (student) => Math.max(0, (student?.customSections || []).length - visibleStudentSections(student).length)
const sectionBadgeTitle = (student) => (student?.customSections || []).map(section => section.name).join(' · ')
const selectedStudentKeys = computed(() => selectedMatriculas.value)
const selectedCount = computed(() => selectedStudentKeys.value.size)
const selectedStudents = computed(() => {
  const selected = selectedStudentKeys.value
  return students.value.filter(student => selected.has(normalizeStudentMatricula(student.matricula)))
})
const selectedBalanceTotal = computed(() => selectedStudents.value.reduce((sum, student) => sum + Number(student?.saldoNeto || 0), 0))
const selectionPrimaryStudent = computed(() => selectedStudents.value[0] || null)
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

const WORKSPACE_LIST_DESIGN_WIDTH = 760
const WORKSPACE_DETAIL_DESIGN_WIDTH = 1180
const WORKSPACE_DESIGN_HEIGHT = 640
const WORKSPACE_MIN_SCALE = 0.54
const baseWorkspaceDesignWidth = computed(() => hasAccountWorkspace.value ? WORKSPACE_DETAIL_DESIGN_WIDTH : WORKSPACE_LIST_DESIGN_WIDTH)
const workspaceDesignWidth = computed(() => Math.max(baseWorkspaceDesignWidth.value, workspaceCanvasWidth.value))
const studentsScaleShellStyle = computed(() => ({
  height: `${Math.ceil(WORKSPACE_DESIGN_HEIGHT * workspaceScale.value)}px`,
  '--workspace-shell-height': `${Math.ceil(WORKSPACE_DESIGN_HEIGHT * workspaceScale.value)}px`
}))
const studentsDesignCanvasStyle = computed(() => ({
  '--workspace-design-width': `${workspaceDesignWidth.value}px`,
  '--workspace-design-height': `${WORKSPACE_DESIGN_HEIGHT}px`,
  '--workspace-scale': workspaceScale.value,
  width: `${workspaceDesignWidth.value}px`,
  height: `${WORKSPACE_DESIGN_HEIGHT}px`,
  transform: `scale(${workspaceScale.value})`
}))

let workspaceResizeObserver = null
let workspaceFrame = null
const updateWorkspaceScale = () => {
  if (typeof window === 'undefined') return
  const shell = studentsScaleShell.value
  const shellTop = shell?.getBoundingClientRect?.().top || 0
  const shellWidth = Math.max(320, shell?.clientWidth || baseWorkspaceDesignWidth.value)
  const availableHeight = Math.max(360, window.innerHeight - shellTop - 10)
  const nextScale = Math.min(1, availableHeight / WORKSPACE_DESIGN_HEIGHT)
  workspaceScale.value = Number(Math.max(WORKSPACE_MIN_SCALE, nextScale).toFixed(4))
  workspaceCanvasWidth.value = Math.max(baseWorkspaceDesignWidth.value, Math.ceil(shellWidth / workspaceScale.value))
  workspaceCanvasHeight.value = WORKSPACE_DESIGN_HEIGHT
}

const scheduleWorkspaceScaleUpdate = () => nextTick(() => {
  if (typeof window === 'undefined') return
  if (workspaceFrame) window.cancelAnimationFrame(workspaceFrame)
  workspaceFrame = window.requestAnimationFrame(updateWorkspaceScale)
})
const sectionModalStudents = computed(() => {
  const selected = new Set(sectionModalMatriculas.value.map(normalizeStudentMatricula))
  return students.value.filter(student => selected.has(normalizeStudentMatricula(student.matricula)))
})
const isStudentSelected = (student) => selectedStudentKeys.value.has(normalizeStudentMatricula(student?.matricula))


const normalizeGradeValue = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim()

const GRADE_NUMBER_MAP = {
  primero: 1,
  primer: 1,
  '1ro': 1,
  '1ero': 1,
  segundo: 2,
  '2do': 2,
  tercero: 3,
  '3ro': 3,
  cuarto: 4,
  '4to': 4,
  quinto: 5,
  '5to': 5,
  sexto: 6,
  '6to': 6
}

const GRADE_PALETTES = {
  1: { accent: '#6aa957', soft: '#edf7e8', border: '#d6e8ca' },
  2: { accent: '#3e9b8c', soft: '#e7f7f3', border: '#c8e7df' },
  3: { accent: '#4f7fd1', soft: '#ebf2ff', border: '#d4e0fb' },
  4: { accent: '#7b67c7', soft: '#f1edff', border: '#ddd5fa' },
  5: { accent: '#c6753e', soft: '#fff2e8', border: '#f0dbc9' },
  6: { accent: '#cc607f', soft: '#fff0f4', border: '#f2d1da' },
  0: { accent: '#7b8798', soft: '#f5f7fa', border: '#e2e8f0' }
}

const gradeNumberValue = (grado) => {
  const normalized = normalizeGradeValue(grado)
  if (!normalized || normalized === 'null') return 0
  const direct = normalized.match(/\d+/)?.[0]
  if (direct) {
    const parsed = Number(direct)
    if (parsed >= 1 && parsed <= 6) return parsed
  }
  const mapped = Object.entries(GRADE_NUMBER_MAP).find(([key]) => normalized.includes(key))
  return mapped ? mapped[1] : 0
}

const gradeVisualNumber = (student) => {
  const number = gradeNumberValue(student?.grado)
  if (number) return String(number)
  const fallback = String(student?.grado || '').trim()
  return fallback ? fallback.slice(0, 1).toUpperCase() : '•'
}

const gradePalette = (student) => GRADE_PALETTES[gradeNumberValue(student?.grado)] || GRADE_PALETTES[0]
const gradeAccentStyle = (student) => {
  const palette = gradePalette(student)
  return {
    '--grade-accent': palette.accent,
    '--grade-soft': palette.soft,
    '--grade-border': palette.border
  }
}

const gradeVisualTitle = (student) => {
  const number = gradeNumberValue(student?.grado)
  const grado = String(student?.grado || '').trim()
  return number ? `Grado ${number}` : (grado || 'Sin grado')
}

const studentGroupLabel = (student) => {
  const value = String(student?.grupo || '').replaceAll('"', '').trim()
  if (!value || value.toLowerCase() === 'null') return ''
  return value
}

const statusSecondaryLine = (student) => {
  const parts = []
  if (student?.nivel && String(student.nivel).toLowerCase() !== 'null') parts.push(student.nivel)
  const group = studentGroupLabel(student)
  if (group) parts.push(group)
  if (student?.estatus !== 'Activo') return parts[0] || 'Alumno'
  if (!isEnrolled(student)) return parts.length ? `${parts.join(' · ')} · pendiente` : 'Pendiente de inscripción'
  return parts.join(' · ') || 'Alumno activo'
}

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

const listRangeLabel = computed(() => {
  const total = displayedStudents.value.length
  if (!total) return 'Sin alumnos'
  return `${total} alumnos`
})


const parseEnrollmentConfig = (obj) => {
  let concepts = []
  const traverse = (o) => {
    if (!o) return
    if (Array.isArray(o)) o.forEach(traverse)
    else if (typeof o === 'object') {
      if (o.concepto_nombre) concepts.push(o.concepto_nombre)
      Object.values(o).forEach(traverse)
    }
  }
  traverse(obj)
  if (concepts.length > 0) {
    externalConcepts.value = [...new Set(concepts.map(c => c.toLowerCase().trim()))]
  }
}

const loadGlobalKpis = async () => {
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch('/api/dashboard/kpis', { params: { ciclo: cicloKey } })
    globalKpis.value.ingresosMes = res.ingresosMes || 0
  } catch(e) {}
}

const loadCustomSections = async () => {
  try {
    const res = await $fetch('/api/student-sections')
    customSections.value = Array.isArray(res) ? res : []
  } catch (e) {
    customSections.value = []
  }
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

const isEnrolled = (student) => {
  if (student.estatus !== 'Activo') return false;
  const conceptsStr = ((student.conceptosCargados || '') + '|' + (student.conceptosPagados || '')).toLowerCase()
  return externalConcepts.value.some(c => conceptsStr.includes(c))
}

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

const customSectionCounts = computed(() => {
  const counts = {}
  students.value.forEach((student) => {
    ;(student.customSections || []).forEach((section) => {
      const id = Number(section.id)
      if (!id) return
      counts[id] = (counts[id] || 0) + 1
    })
  })
  return counts
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

const displayedMatriculas = computed(() => displayedStudents.value.map(student => normalizeStudentMatricula(student.matricula)).filter(Boolean))
const allDisplayedSelected = computed(() => displayedMatriculas.value.length > 0 && displayedMatriculas.value.every(matricula => selectedStudentKeys.value.has(matricula)))
const someDisplayedSelected = computed(() => displayedMatriculas.value.some(matricula => selectedStudentKeys.value.has(matricula)))

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
}

const selectedDebtRows = computed(() => Object.values(bulkPaymentDebts.value).flat())
const bulkPaymentDebtCount = computed(() => selectedDebtRows.value.filter(debt => Number(debt?.saldo || 0) > 0).length)

const buildPaymentRows = (debts, amount) => {
  let remaining = Math.max(0, Number(amount || 0))
  return (debts || []).filter(debt => Number(debt?.saldo || 0) > 0).map((debt) => {
    const saldo = Number(debt.saldo || 0)
    const montoPagado = Math.min(saldo, remaining)
    remaining = Math.max(0, remaining - montoPagado)
    const resuelto = Number(debt.resuelto ?? debt.pagos ?? 0)
    return {
      ...debt,
      saldoFinal: saldo,
      montoPagado,
      pagosPrevios: resuelto,
      saldoAntes: Number(debt.subtotal || 0) - resuelto
    }
  })
}

const bulkPaymentPlan = computed(() => {
  let remainingTotal = Math.max(0, Number(bulkPaymentAmount.value || 0))
  return selectedStudents.value.map((student) => {
    const debts = bulkPaymentDebts.value[normalizeStudentMatricula(student.matricula)] || []
    const balance = debts.reduce((sum, debt) => sum + Math.max(0, Number(debt?.saldo || 0)), 0)
    let amount = balance
    if (bulkPaymentStrategy.value === 'same') amount = Math.min(balance, Math.max(0, Number(bulkPaymentAmount.value || 0)))
    if (bulkPaymentStrategy.value === 'total') {
      amount = Math.min(balance, remainingTotal)
      remainingTotal = Math.max(0, remainingTotal - amount)
    }
    return {
      student,
      debts,
      balance,
      amount,
      after: Math.max(0, balance - amount),
      pagos: buildPaymentRows(debts, amount)
    }
  })
})
const bulkPaymentTotal = computed(() => bulkPaymentPlan.value.reduce((sum, item) => sum + Number(item.amount || 0), 0))
const bulkPaymentStudentCount = computed(() => bulkPaymentPlan.value.filter(item => item.amount > 0).length)

const loadBulkPaymentDebts = async () => {
  if (!selectedStudents.value.length) return
  bulkPaymentLoading.value = true
  const next = { ...bulkPaymentDebts.value }
  try {
    await Promise.all(selectedStudents.value.map(async (student) => {
      const key = normalizeStudentMatricula(student.matricula)
      if (next[key]) return
      const res = await $fetch(`/api/students/${student.matricula}/debts`, {
        params: { ciclo: normalizeCicloKey(state.value.ciclo), lateFeeActive: state.value.lateFeeActive }
      })
      next[key] = Array.isArray(res) ? res : []
    }))
    bulkPaymentDebts.value = next
  } catch (e) {
    show(e?.data?.message || 'No se pudieron cargar los adeudos seleccionados', 'danger')
  } finally {
    bulkPaymentLoading.value = false
  }
}

const submitBulkPayments = async () => {
  const payable = bulkPaymentPlan.value.filter(item => item.amount > 0)
  if (!payable.length || bulkPaymentProcessing.value) return
  bulkPaymentProcessing.value = true
  const folios = []
  const failures = []
  try {
    for (const item of payable) {
      try {
        const res = await $fetch('/api/payments/pay', {
          method: 'POST',
          body: {
            matricula: item.student.matricula,
            formaDePago: bulkPaymentMethod.value,
            ciclo: normalizeCicloKey(state.value.ciclo),
            pagos: item.pagos
          }
        })
        if (Array.isArray(res?.folios)) folios.push(...res.folios)
      } catch (e) {
        failures.push(item.student.matricula)
      }
    }
    if (folios.length) window.open(`/print/recibo?folios=${folios.join(',')}`, '_blank', 'width=850,height=800')
    if (failures.length) show(`Pagos registrados parcialmente. Fallaron: ${failures.join(', ')}`, 'danger')
    else show('Pagos de la selección registrados', 'success')
    bulkPaymentDebts.value = {}
    await performSearch()
    if (!failures.length) clearSelectedStudents()
  } finally {
    bulkPaymentProcessing.value = false
  }
}

const setSelectedMatriculas = (values) => {
  selectedMatriculas.value = new Set((values || []).map(normalizeStudentMatricula).filter(Boolean))
}

const clearSelectedStudents = () => {
  setSelectedMatriculas([])
  lastSelectedMatricula.value = null
  bulkWorkspaceMode.value = 'none'
}

const toggleStudentSelection = (student, event = null, force = null) => {
  const matricula = normalizeStudentMatricula(student?.matricula)
  if (!matricula) return

  const next = new Set(selectedMatriculas.value)
  const rangeAnchor = lastSelectedMatricula.value
  if (event?.shiftKey && rangeAnchor) {
    const visible = displayedMatriculas.value
    const start = visible.indexOf(rangeAnchor)
    const end = visible.indexOf(matricula)
    if (start >= 0 && end >= 0) {
      visible.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(value => next.add(value))
    } else {
      next.add(matricula)
    }
  } else if (force === true) {
    next.add(matricula)
  } else if (force === false) {
    next.delete(matricula)
  } else if (next.has(matricula)) {
    next.delete(matricula)
  } else {
    next.add(matricula)
  }

  selectedMatriculas.value = next
  lastSelectedMatricula.value = matricula
}

const toggleDisplayedSelection = () => {
  const next = new Set(selectedMatriculas.value)
  if (allDisplayedSelected.value) displayedMatriculas.value.forEach(matricula => next.delete(matricula))
  else displayedMatriculas.value.forEach(matricula => next.add(matricula))
  selectedMatriculas.value = next
  lastSelectedMatricula.value = displayedMatriculas.value[displayedMatriculas.value.length - 1] || null
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

const updateStudentSections = (matricula, sections) => {
  const normalized = normalizeStudentMatricula(matricula)
  students.value = students.value.map((student) => normalizeStudentMatricula(student.matricula) === normalized
    ? { ...student, customSections: sections || [] }
    : student
  )
  if (selectedStudent.value && normalizeStudentMatricula(selectedStudent.value.matricula) === normalized) {
    selectedStudent.value = { ...selectedStudent.value, customSections: sections || [] }
  }
  if (sectionModalStudent.value && normalizeStudentMatricula(sectionModalStudent.value.matricula) === normalized) {
    sectionModalStudent.value = { ...sectionModalStudent.value, customSections: sections || [] }
  }
}

const applySectionChangeToStudents = (matriculas, section, shouldAdd) => {
  const targets = new Set((matriculas || []).map(normalizeStudentMatricula).filter(Boolean))
  const sectionId = Number(section?.id)
  if (!targets.size || !sectionId) return

  const patch = (student) => {
    if (!targets.has(normalizeStudentMatricula(student?.matricula))) return student
    const current = student.customSections || []
    const withoutSection = current.filter(existing => Number(existing.id) !== sectionId)
    return {
      ...student,
      customSections: shouldAdd ? [...withoutSection, section] : withoutSection
    }
  }

  students.value = students.value.map(patch)
  if (selectedStudent.value) selectedStudent.value = patch(selectedStudent.value)
  if (sectionModalStudent.value) sectionModalStudent.value = patch(sectionModalStudent.value)
}

const openSectionModal = (student = null) => {
  sectionModalStudent.value = student
  sectionModalMatriculas.value = []
  newSectionName.value = ''
  showSectionModal.value = true
}

const openSectionModalForSelection = () => {
  if (!selectedCount.value) return
  sectionModalStudent.value = null
  sectionModalMatriculas.value = Array.from(selectedMatriculas.value)
  newSectionName.value = ''
  showSectionModal.value = true
}

const closeSectionModal = () => {
  showSectionModal.value = false
  sectionModalStudent.value = null
  sectionModalMatriculas.value = []
  newSectionName.value = ''
}

const createCustomSection = async () => {
  const name = newSectionName.value.trim()
  if (!name || creatingSection.value) return
  creatingSection.value = true
  try {
    const section = await $fetch('/api/student-sections', { method: 'POST', body: { name } })
    if (section?.id && !customSections.value.some(existing => Number(existing.id) === Number(section.id))) {
      customSections.value = [...customSections.value, section]
    }
    newSectionName.value = ''
    show('Seccion creada', 'success')
  } catch (e) {
    show(e?.data?.message || 'No se pudo crear la seccion', 'danger')
  } finally {
    creatingSection.value = false
  }
}

const toggleStudentSection = async (student, sectionId, checked) => {
  if (!student || assigningSections.value) return
  assigningSections.value = true
  const currentIds = new Set(normalizeSectionIds(student.customSections || []))
  if (checked) currentIds.add(Number(sectionId))
  else currentIds.delete(Number(sectionId))

  try {
    const res = await $fetch(`/api/students/${student.matricula}/sections`, {
      method: 'PUT',
      body: { sectionIds: Array.from(currentIds) }
    })
    updateStudentSections(student.matricula, res?.sections || [])
    show('Secciones actualizadas', 'success')
  } catch (e) {
    show(e?.data?.message || 'No se pudo actualizar la seccion del alumno', 'danger')
  } finally {
    assigningSections.value = false
  }
}

const bulkSectionState = (sectionId) => {
  const sectionStudents = sectionModalStudents.value
  if (!sectionStudents.length) return 'none'
  const assignedCount = sectionStudents.filter(student => studentHasSection(student, sectionId)).length
  if (assignedCount === 0) return 'none'
  if (assignedCount === sectionStudents.length) return 'all'
  return 'some'
}

const toggleBulkSection = async (section) => {
  if (!section?.id || assigningSections.value || !sectionModalStudents.value.length) return
  const state = bulkSectionState(section.id)
  const shouldAdd = state !== 'all'
  const matriculas = sectionModalStudents.value.map(student => student.matricula)
  assigningSections.value = true

  try {
    const res = await $fetch('/api/students/sections/bulk', {
      method: 'PUT',
      body: {
        matriculas,
        sectionId: section.id,
        action: shouldAdd ? 'add' : 'remove'
      }
    })
    const appliedSection = res?.section || section
    applySectionChangeToStudents(res?.matriculas || matriculas, appliedSection, shouldAdd)
    show('Secciones actualizadas', 'success')
  } catch (e) {
    show(e?.data?.message || 'No se pudo actualizar la selección', 'danger')
  } finally {
    assigningSections.value = false
  }
}

const deleteCustomSection = async (section) => {
  if (!section?.id) return
  if (!confirm(`Eliminar la seccion "${section.name}"?`)) return

  try {
    await $fetch(`/api/student-sections/${section.id}`, { method: 'DELETE' })
    customSections.value = customSections.value.filter(existing => Number(existing.id) !== Number(section.id))
    students.value = students.value.map(student => ({
      ...student,
      customSections: (student.customSections || []).filter(current => Number(current.id) !== Number(section.id))
    }))
    if (selectedStudent.value) {
      selectedStudent.value = {
        ...selectedStudent.value,
        customSections: (selectedStudent.value.customSections || []).filter(current => Number(current.id) !== Number(section.id))
      }
    }
    if (activeFilter.value === sectionFilterKey(section.id)) activeFilter.value = ''
    show('Seccion eliminada', 'success')
  } catch (e) {
    show(e?.data?.message || 'No se pudo eliminar la seccion', 'danger')
  }
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
  scheduleWorkspaceScaleUpdate()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleWorkspaceScaleUpdate, { passive: true })
    if (typeof ResizeObserver !== 'undefined' && studentsScaleShell.value) {
      workspaceResizeObserver = new ResizeObserver(scheduleWorkspaceScaleUpdate)
      workspaceResizeObserver.observe(studentsScaleShell.value)
    }
  }

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

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleWorkspaceScaleUpdate)
    if (workspaceFrame) window.cancelAnimationFrame(workspaceFrame)
  }
  workspaceResizeObserver?.disconnect?.()
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

<style scoped>
.students-screen {
  display: flex;
  width: 100%;
  max-width: 1360px;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin: 0 auto;
  overflow: hidden;
}

.students-hero {
  display: flex;
  min-height: 48px;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 0 0 6px;
}

.hero-copy h1 {
  margin: 0 0 5px;
  color: #23324a;
  font-size: clamp(1.16rem, 1.32vw, 1.38rem);
  font-weight: 720;
  line-height: 1.14;
  letter-spacing: 0;
}

.hero-copy p {
  margin: 0;
  color: #7b879a;
  font-size: 0.78rem;
  font-weight: 450;
  line-height: 1.45;
}

.hero-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 14px;
  padding-top: 0;
}

.monthly-income {
  display: flex;
  width: 212px;
  height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  padding: 8px 12px 8px 14px;
  box-shadow: 0 4px 14px rgba(22, 38, 65, 0.03);
}

.monthly-income span {
  display: block;
  color: #5f7f58;
  font-size: 0.61rem;
  font-weight: 680;
  letter-spacing: 0.06em;
  line-height: 1.1;
  text-transform: uppercase;
}

.monthly-income strong {
  display: block;
  margin-top: 4px;
  color: #335d3a;
  font-size: 1rem;
  font-weight: 720;
  line-height: 1;
}

.monthly-income svg {
  width: 70px;
  height: 32px;
  overflow: visible;
  opacity: 0.55;
}

.monthly-income polyline {
  fill: none;
  stroke: #66af46;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.new-student-button {
  height: 42px;
  min-width: 185px;
  border-radius: 10px;
  font-size: 0.9rem;
}

.kpi-grid {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  gap: 8px;
  margin-bottom: 6px;
}

.kpi-card {
  position: relative;
  display: grid;
  min-height: 58px;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.84);
  padding: 7px 10px;
  text-align: left;
  box-shadow: 0 4px 16px rgba(22, 38, 65, 0.028);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.kpi-card::before {
  content: "";
  position: absolute;
  z-index: 0;
  right: -20px;
  bottom: -24px;
  width: 116px;
  height: 82px;
  opacity: 0.12;
  background-repeat: no-repeat;
  background-size: contain;
  background-image: url("data:image/svg+xml,%3Csvg width='134' height='92' viewBox='0 0 134 92' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M92 88C77 54 86 28 123 8C130 48 114 75 92 88Z' stroke='%23dce8de' stroke-width='1'/%3E%3Cpath d='M57 88C50 54 63 30 103 18C101 57 84 78 57 88Z' stroke='%23dce8de' stroke-width='1'/%3E%3Cpath d='M18 90C39 66 68 56 113 55' stroke='%23dce8de' stroke-width='1'/%3E%3C/svg%3E");
  pointer-events: none;
}

.kpi-card::after {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
}

.kpi-card:hover,
.kpi-card.active {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(22, 38, 65, 0.045);
}

.kpi-card.active {
  border-color: rgba(101, 167, 68, 0.34);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 2px rgba(101, 167, 68, 0.24), 0 8px 22px rgba(22, 38, 65, 0.045);
}

.kpi-card.active::after,
.kpi-card:hover::after {
  opacity: 1;
}

.kpi-icon {
  position: relative;
  z-index: 1;
  display: flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.kpi-green .kpi-icon { background: radial-gradient(circle at 32% 22%, #eff9e9, #dff1d6 70%); color: #58a93f; }
.kpi-teal .kpi-icon { background: radial-gradient(circle at 32% 22%, #e8fbf8, #d6f2ee 70%); color: #238a83; }
.kpi-blue .kpi-icon { background: radial-gradient(circle at 32% 22%, #eff5ff, #e0ebff 70%); color: #416fa8; }
.kpi-red .kpi-icon { background: radial-gradient(circle at 32% 22%, #fff0ed, #ffe1dc 70%); color: #c95b4d; }
.kpi-gray .kpi-icon { background: radial-gradient(circle at 32% 22%, #f3f6fa, #e4eaf2 70%); color: #66728a; }
.kpi-section .kpi-icon { background: radial-gradient(circle at 32% 22%, #f4f2ff, #e7e2ff 70%); color: #6554b8; }

.kpi-green::after { background: linear-gradient(90deg, rgba(224, 242, 216, 0.52), transparent 46%); }
.kpi-teal::after { background: linear-gradient(90deg, rgba(216, 244, 240, 0.5), transparent 46%); }
.kpi-blue::after { background: linear-gradient(90deg, rgba(224, 235, 255, 0.46), transparent 46%); }
.kpi-red::after { background: linear-gradient(90deg, rgba(255, 228, 223, 0.46), transparent 46%); }
.kpi-gray::after { background: linear-gradient(90deg, rgba(226, 232, 240, 0.5), transparent 46%); }
.kpi-section::after { background: linear-gradient(90deg, rgba(231, 226, 255, 0.5), transparent 46%); }

.kpi-text {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.kpi-text span {
  color: #536b58;
  font-size: 0.61rem;
  font-weight: 680;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.kpi-teal .kpi-text span { color: #47716e; }
.kpi-blue .kpi-text span { color: #4f6072; }
.kpi-red .kpi-text span { color: #655d5b; }
.kpi-section .kpi-text span { color: #5d4b9a; }

.kpi-text strong {
  margin-top: 2px;
  color: #25344e;
  font-size: 1rem;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1;
}

.kpi-text em {
  margin-top: 2px;
  color: #8791a1;
  font-size: 0.64rem;
  font-style: normal;
  font-weight: 460;
}

.kpi-icon svg {
  width: 17px;
  height: 17px;
  align-self: center;
  margin: 0;
  filter: none;
}

.kpi-card > svg {
  display: none;
}

.kpi-card polyline {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.05;
}

.kpi-green polyline { stroke: #66af46; }
.kpi-teal polyline { stroke: #12aaa1; }
.kpi-blue polyline { stroke: #397fe8; }
.kpi-red polyline { stroke: #ff4d38; }
.kpi-gray polyline { stroke: #64748b; }
.kpi-section polyline { stroke: #7c68d9; }

.filter-bar {
  display: grid;
  grid-template-columns: minmax(260px, 365px) minmax(0, 1fr) auto;
  flex-shrink: 0;
  align-items: flex-start;
  gap: 10px;
  min-height: 38px;
  margin-bottom: 6px;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.82);
  padding: 5px 8px;
  box-shadow: 0 4px 14px rgba(22, 38, 65, 0.025);
}

.active-filter-strip {
  display: flex;
  min-height: 26px;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  margin: -1px 0 6px;
  overflow-x: auto;
}

.filter-token {
  display: inline-flex;
  align-items: center;
  border: 1px solid #cfe0c8;
  border-radius: 999px;
  background: #f1f8ee;
  color: #416d3b;
  padding: 4px 9px;
  font-size: 0.66rem;
  font-weight: 680;
  white-space: nowrap;
}

.search-control {
  display: flex;
  height: 30px;
  margin-top: 2px;
  align-items: center;
  gap: 9px;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #fbfcfd;
  padding: 0 13px;
  color: #8190a8;
}

.search-control input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: #172841;
  font-size: 0.72rem;
  font-weight: 500;
  outline: none;
}

.search-control input::placeholder {
  color: #7d879d;
}

.grade-filter {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  overflow: visible;
}

.grade-tabs,
.group-tabs {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  overflow: visible;
  padding: 2px 0;
}

.group-tabs {
  border-top: 1px solid #edf2f6;
  padding-top: 6px;
}

.grade-tabs .chip,
.group-tabs .chip {
  flex: 0 0 auto;
}

.tab-divider {
  width: 1px;
  height: 24px;
  flex-shrink: 0;
  background: #dfe6ef;
}

.export-button {
  min-width: 138px;
  height: 32px;
}

.students-workspace {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 10px;
}

.student-list-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  transition: width 200ms ease;
}

.student-list-panel.is-compact {
  width: clamp(360px, 26vw, 392px);
  flex: 0 0 clamp(360px, 26vw, 392px);
}

.student-list-panel.is-full {
  width: 100%;
  flex: 1 1 auto;
}

.student-list-card,
.student-detail-panel {
  min-height: 0;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 5px 18px rgba(22, 38, 65, 0.032);
}

.student-list-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
}

.student-list-panel.is-compact .student-list-card {
  background: rgba(255, 255, 255, 0.74);
  box-shadow: none;
}

.student-list-panel.is-compact .list-titlebar,
.student-list-panel.is-compact .list-columns,
.student-list-panel.is-compact .student-row {
  border-color: #edf2f6;
}

.student-list-panel.is-compact .student-row:not(.selected):not(.multi-selected) {
  opacity: 0.92;
}

.student-list-panel.is-compact .student-row:not(.selected):hover {
  opacity: 1;
}

.student-list-panel.is-compact .student-copy strong {
  font-weight: 620;
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.student-list-panel.is-compact .financial-balance {
  font-size: 0.74rem;
}

.student-list-panel.is-compact .financial-balance.danger {
  color: #a95d62;
}

.list-titlebar {
  display: flex;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8eef5;
  padding: 0 17px;
}

.list-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.select-visible-toggle {
  position: relative;
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7e1ed;
  border-radius: 6px;
  background: #fbfcfd;
  color: #527d49;
  opacity: 0.72;
  transition: opacity 150ms ease, border-color 150ms ease, background 150ms ease;
}

.select-visible-toggle:disabled {
  opacity: 0.28;
}

.select-visible-toggle:not(:disabled):hover,
.select-visible-toggle.active,
.select-visible-toggle.partial {
  border-color: #9fc493;
  background: #f1f8ee;
  opacity: 1;
}

.select-visible-toggle span {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}

.select-visible-toggle.active span {
  background: #5f9d4b;
}

.select-visible-toggle.partial span {
  width: 9px;
  height: 2px;
  background: #5f9d4b;
}

.list-titlebar h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: #4f5c71;
  font-size: 0.72rem;
  font-weight: 680;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.list-titlebar h2 span {
  border-radius: 999px;
  background: #e8f2e4;
  color: #517947;
  padding: 3px 9px;
  font-size: 0.72rem;
  line-height: 1;
}

.list-title-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.list-title-actions > button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f7fafc;
  color: #64748b;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.list-title-actions > button:not(.title-action-pill) {
  width: 28px;
}

.list-title-actions > button:hover {
  border-color: #dfe6ef;
  background: #fff;
  color: #2d7132;
}

.title-action-pill {
  gap: 6px;
  border-color: #dbe7f5 !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #ffffff, #f6fafe) !important;
  color: #43627c !important;
  padding: 0 11px;
  font-size: 0.66rem;
  font-weight: 760;
  letter-spacing: 0.02em;
}

.title-action-pill:hover {
  border-color: #c6d7ea !important;
  color: #2e5979 !important;
}

.list-columns {
  display: grid;
  height: 22px;
  flex-shrink: 0;
  align-items: center;
  color: #7b8798;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 0 20px 4px;
  text-transform: uppercase;
}

.list-columns.compact,
.student-row.compact {
  grid-template-columns: minmax(0, 1fr) 122px 48px;
}

.list-columns.full,
.student-row.full {
  grid-template-columns: minmax(0, 1.8fr) 156px 56px;
}

.list-columns span:nth-child(2) {
  text-align: right;
}

.student-list-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  padding: 10px 10px 0;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-width: thin;
}

.student-row {
  position: relative;
  display: grid;
  min-height: 108px;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  border: 1px solid #e8edf4;
  border-radius: 26px;
  background: linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,253,0.98));
  padding: 18px 20px;
  text-align: left;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.04);
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
  cursor: pointer;
  user-select: none;
}

.student-row:last-child {
  margin-bottom: 0;
}

.student-row:hover {
  border-color: #d8e3f0;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.student-row:focus-visible {
  outline: 2px solid rgba(76, 128, 236, 0.18);
  outline-offset: 2px;
}

.student-row.selected {
  border-color: #b9cffd;
  background: linear-gradient(135deg, rgba(243,247,255,0.99), rgba(255,255,255,0.98));
  box-shadow: 0 16px 40px rgba(66, 115, 232, 0.12);
}

.student-row.multi-selected:not(.selected) {
  border-color: #d8e3f6;
  background: linear-gradient(135deg, rgba(249,250,252,0.99), rgba(255,255,255,0.98));
}

.student-row.inactive {
  background: linear-gradient(135deg, rgba(255,249,248,0.98), rgba(255,255,255,0.98));
}

.student-row.unenrolled {
  background: linear-gradient(135deg, rgba(255,252,246,0.98), rgba(255,255,255,0.98));
}

.student-row.compact {
  min-height: 92px;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 22px;
}

.student-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
}

.row-select-toggle {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 2px solid #d8dde7;
  border-radius: 16px;
  background: #fff;
  color: #fff;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms ease, box-shadow 150ms ease;
}

.row-select-toggle:hover {
  transform: scale(1.02);
}

.row-select-toggle.active {
  border-color: #2d6cf2;
  background: linear-gradient(180deg, #2f78ff, #1f62eb);
  box-shadow: 0 10px 22px rgba(47, 120, 255, 0.22);
}

.row-select-toggle span {
  width: 13px;
  height: 8px;
  border-bottom: 3px solid currentColor;
  border-left: 3px solid currentColor;
  opacity: 0;
  transform: rotate(-45deg) translate(1px, -1px);
}

.row-select-toggle.active span {
  opacity: 1;
}

.student-grade-mark {
  display: flex;
  width: 106px;
  height: 106px;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--grade-border);
  border-radius: 24px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--grade-soft) 84%, #fff 16%) 0%, #ffffff 100%);
  color: var(--grade-accent);
}

.student-grade-number {
  font-size: 3rem;
  font-weight: 820;
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.student-grade-label {
  margin-top: 6px;
  color: color-mix(in srgb, var(--grade-accent) 72%, #64748b 28%);
  font-size: 1rem;
  font-weight: 780;
  letter-spacing: 0.24em;
  line-height: 1;
  text-transform: uppercase;
}

.student-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.student-copy strong {
  display: -webkit-box;
  overflow: hidden;
  color: #12295c;
  font-size: 1.2rem;
  font-weight: 760;
  line-height: 1.08;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.student-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.student-meta > span,
.student-meta small {
  display: inline-flex;
  align-items: center;
  border-radius: 16px;
  padding: 7px 14px;
  font-style: normal;
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.student-meta > span {
  background: #f4f6fa;
  color: #74819a;
}

.student-meta .group-chip {
  background: color-mix(in srgb, var(--grade-soft) 82%, #fff 18%);
  color: var(--grade-accent);
}

.student-section-badges {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.student-section-badges b,
.detail-section-badges b {
  display: inline-flex;
  max-width: 220px;
  align-items: center;
  overflow: hidden;
  border: 1px solid #d8d5f0;
  border-radius: 999px;
  background: #f6f4ff;
  color: #5d4b9a;
  padding: 5px 10px;
  font-size: 0.68rem;
  font-weight: 760;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-section-badges .badge-more {
  border-color: #dfe5ef;
  background: #f8fafc;
  color: #6f7b90;
}

.financial-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 7px;
}

.financial-label {
  color: #74819a;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.financial-balance {
  color: var(--grade-accent);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1.26rem;
  font-weight: 760;
  line-height: 1;
  text-align: right;
  white-space: nowrap;
}

.financial-balance.danger {
  color: var(--grade-accent);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  color: #c2cad8;
}

.row-actions button {
  display: flex;
  width: 62px;
  height: 62px;
  align-items: center;
  justify-content: center;
  border: 2px solid color-mix(in srgb, var(--grade-border) 88%, #ffffff 12%);
  border-radius: 20px;
  background: color-mix(in srgb, var(--grade-soft) 78%, #ffffff 22%);
  color: #26314f;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}

.student-row:hover .row-actions button {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}

.row-actions > svg {
  width: 20px;
  height: 20px;
  opacity: 0.7;
}

.student-row.compact .row-select-toggle {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border-width: 1.5px;
}

.student-row.compact .row-select-toggle span {
  width: 10px;
  height: 6px;
  border-width: 2px;
}

.student-row.compact .student-identity {
  gap: 12px;
}

.student-row.compact .student-grade-mark {
  width: 58px;
  height: 58px;
  border-radius: 18px;
}

.student-row.compact .student-grade-number {
  font-size: 1.9rem;
}

.student-row.compact .student-grade-label {
  margin-top: 3px;
  font-size: 0.56rem;
  letter-spacing: 0.16em;
}

.student-row.compact .student-copy {
  gap: 6px;
}

.student-row.compact .student-copy strong {
  font-size: 1rem;
}

.student-row.compact .student-meta {
  gap: 8px;
}

.student-row.compact .student-meta > span,
.student-row.compact .student-meta small {
  padding: 5px 10px;
  font-size: 0.72rem;
}

.student-row.compact .student-section-badges {
  display: none;
}

.student-row.compact .financial-cell {
  gap: 4px;
}

.student-row.compact .financial-label {
  font-size: 0.62rem;
}

.student-row.compact .financial-balance {
  font-size: 0.94rem;
}

.student-row.compact .row-actions {
  gap: 8px;
}

.student-row.compact .row-actions button {
  width: 38px;
  height: 38px;
  border-radius: 14px;
}
.empty-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  color: #66728a;
  font-size: 0.92rem;
  font-weight: 700;
}

.loading-state {
  flex-direction: column;
  gap: 12px;
}

.empty-state.muted {
  color: #9aa5b7;
}

.list-footer {
  display: flex;
  min-height: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 17px 12px;
  color: #818b9b;
  font-size: 0.68rem;
  font-weight: 450;
}

.list-footer.selection-footer {
  position: sticky;
  bottom: 0;
  z-index: 6;
  display: block;
  margin-top: 14px;
  border: 1px solid #b9cffd;
  border-radius: 28px 28px 0 0;
  background: linear-gradient(180deg, rgba(247,250,255,0.98), rgba(255,255,255,0.99));
  padding: 16px 18px 18px;
  box-shadow: 0 -10px 30px rgba(66, 115, 232, 0.08);
  color: #1c3f8e;
}

.selection-summary-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(150px, 0.72fr) auto;
  align-items: center;
  gap: 18px;
}

.selection-summary-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
}

.selection-avatar {
  position: relative;
  display: inline-flex;
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #2f78ff, #1f62eb);
  color: #fff;
  box-shadow: 0 16px 26px rgba(47, 120, 255, 0.22);
}

.selection-avatar-count {
  position: absolute;
  top: -4px;
  right: -4px;
  display: inline-flex;
  min-width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 3px solid #fff;
  border-radius: 999px;
  background: #ffffff;
  color: #2f78ff;
  padding: 0 6px;
  font-size: 0.85rem;
  font-weight: 800;
}

.selection-summary-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.selection-summary-copy small {
  color: #2f78ff;
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1;
}

.selection-summary-copy strong {
  overflow: hidden;
  color: #12295c;
  font-size: 1.02rem;
  font-weight: 760;
  line-height: 1.08;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-summary-copy em {
  overflow: hidden;
  color: #74819a;
  font-size: 0.8rem;
  font-style: normal;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-summary-total {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  border-left: 1px solid #d8e3f6;
  padding-left: 18px;
}

.selection-summary-total small {
  color: #74819a;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
}

.selection-summary-total strong {
  color: #2f78ff;
  font-size: 1.1rem;
  font-weight: 780;
  line-height: 1;
}

.selection-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.selection-actions.hero {
  justify-self: end;
}

.footer-action {
  display: inline-flex;
  height: 46px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid #dce6f2;
  border-radius: 999px;
  background: #fff;
  color: #5e6d82;
  padding: 0 16px;
  font-size: 0.84rem;
  font-weight: 740;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease, transform 150ms ease;
}

.footer-action:hover {
  transform: translateY(-1px);
}

.footer-action.primary {
  border-color: transparent;
  background: linear-gradient(180deg, #2f78ff, #1f62eb);
  color: #fff;
  box-shadow: 0 14px 26px rgba(47, 120, 255, 0.22);
}

.footer-action.primary.big {
  height: 58px;
  min-width: 190px;
  padding: 0 24px;
  font-size: 0.98rem;
  font-weight: 760;
}

.footer-action.ghost {
  width: 48px;
  padding: 0;
}

.footer-action.icon {
  width: 23px;
  padding: 0;
}

.student-detail-panel {
  min-height: 0;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 5px 18px rgba(22, 38, 65, 0.032);
}

.student-list-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
}

.student-list-panel.is-compact .student-list-card {
  background: rgba(255, 255, 255, 0.74);
  box-shadow: none;
}

.student-list-panel.is-compact .list-titlebar,
.student-list-panel.is-compact .list-columns,
.student-list-panel.is-compact .student-row {
  border-color: #edf2f6;
}

.student-list-panel.is-compact .student-row:not(.selected):not(.multi-selected) {
  opacity: 0.92;
}

.student-list-panel.is-compact .student-row:not(.selected):hover {
  opacity: 1;
}

.student-list-panel.is-compact .student-copy strong {
  font-weight: 620;
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.student-list-panel.is-compact .financial-balance {
  font-size: 0.74rem;
}

.student-list-panel.is-compact .financial-balance.danger {
  color: #a95d62;
}

.list-titlebar {
  display: flex;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8eef5;
  padding: 0 17px;
}

.list-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.select-visible-toggle {
  position: relative;
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7e1ed;
  border-radius: 6px;
  background: #fbfcfd;
  color: #527d49;
  opacity: 0.72;
  transition: opacity 150ms ease, border-color 150ms ease, background 150ms ease;
}

.select-visible-toggle:disabled {
  opacity: 0.28;
}

.select-visible-toggle:not(:disabled):hover,
.select-visible-toggle.active,
.select-visible-toggle.partial {
  border-color: #9fc493;
  background: #f1f8ee;
  opacity: 1;
}

.select-visible-toggle span {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}

.select-visible-toggle.active span {
  background: #5f9d4b;
}

.select-visible-toggle.partial span {
  width: 9px;
  height: 2px;
  background: #5f9d4b;
}

.list-titlebar h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: #4f5c71;
  font-size: 0.72rem;
  font-weight: 680;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.list-titlebar h2 span {
  border-radius: 999px;
  background: #e8f2e4;
  color: #517947;
  padding: 3px 9px;
  font-size: 0.72rem;
  line-height: 1;
}

.list-title-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.list-title-actions > button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f7fafc;
  color: #64748b;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.list-title-actions > button:not(.title-action-pill) {
  width: 28px;
}

.list-title-actions > button:hover {
  border-color: #dfe6ef;
  background: #fff;
  color: #2d7132;
}

.title-action-pill {
  gap: 6px;
  border-color: #dbe7f5 !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #ffffff, #f6fafe) !important;
  color: #43627c !important;
  padding: 0 11px;
  font-size: 0.66rem;
  font-weight: 760;
  letter-spacing: 0.02em;
}

.title-action-pill:hover {
  border-color: #c6d7ea !important;
  color: #2e5979 !important;
}

.list-columns {
  display: grid;
  height: 22px;
  flex-shrink: 0;
  align-items: center;
  color: #7b8798;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 0 20px 4px;
  text-transform: uppercase;
}

.list-columns.compact,
.student-row.compact {
  grid-template-columns: minmax(0, 1fr) 122px 48px;
}

.list-columns.full,
.student-row.full {
  grid-template-columns: minmax(0, 1.8fr) 156px 56px;
}

.list-columns span:nth-child(2) {
  text-align: right;
}

.student-list-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  padding: 10px 10px 0;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-width: thin;
}

.student-row {
  position: relative;
  display: grid;
  min-height: 108px;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  border: 1px solid #e8edf4;
  border-radius: 26px;
  background: linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,253,0.98));
  padding: 18px 20px;
  text-align: left;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.04);
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
  cursor: pointer;
  user-select: none;
}

.student-row:last-child {
  margin-bottom: 0;
}

.student-row:hover {
  border-color: #d8e3f0;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.student-row:focus-visible {
  outline: 2px solid rgba(76, 128, 236, 0.18);
  outline-offset: 2px;
}

.student-row.selected {
  border-color: #b9cffd;
  background: linear-gradient(135deg, rgba(243,247,255,0.99), rgba(255,255,255,0.98));
  box-shadow: 0 16px 40px rgba(66, 115, 232, 0.12);
}

.student-row.multi-selected:not(.selected) {
  border-color: #d8e3f6;
  background: linear-gradient(135deg, rgba(249,250,252,0.99), rgba(255,255,255,0.98));
}

.student-row.inactive {
  background: linear-gradient(135deg, rgba(255,249,248,0.98), rgba(255,255,255,0.98));
}

.student-row.unenrolled {
  background: linear-gradient(135deg, rgba(255,252,246,0.98), rgba(255,255,255,0.98));
}

.student-row.compact {
  min-height: 92px;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 22px;
}

.student-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
}

.row-select-toggle {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 2px solid #d8dde7;
  border-radius: 16px;
  background: #fff;
  color: #fff;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms ease, box-shadow 150ms ease;
}

.row-select-toggle:hover {
  transform: scale(1.02);
}

.row-select-toggle.active {
  border-color: #2d6cf2;
  background: linear-gradient(180deg, #2f78ff, #1f62eb);
  box-shadow: 0 10px 22px rgba(47, 120, 255, 0.22);
}

.row-select-toggle span {
  width: 13px;
  height: 8px;
  border-bottom: 3px solid currentColor;
  border-left: 3px solid currentColor;
  opacity: 0;
  transform: rotate(-45deg) translate(1px, -1px);
}

.row-select-toggle.active span {
  opacity: 1;
}

.student-grade-mark {
  display: flex;
  width: 106px;
  height: 106px;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--grade-border);
  border-radius: 24px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--grade-soft) 84%, #fff 16%) 0%, #ffffff 100%);
  color: var(--grade-accent);
}

.student-grade-number {
  font-size: 3rem;
  font-weight: 820;
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.student-grade-label {
  margin-top: 6px;
  color: color-mix(in srgb, var(--grade-accent) 72%, #64748b 28%);
  font-size: 1rem;
  font-weight: 780;
  letter-spacing: 0.24em;
  line-height: 1;
  text-transform: uppercase;
}

.student-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.student-copy strong {
  display: -webkit-box;
  overflow: hidden;
  color: #12295c;
  font-size: 1.2rem;
  font-weight: 760;
  line-height: 1.08;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.student-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.student-meta > span,
.student-meta small {
  display: inline-flex;
  align-items: center;
  border-radius: 16px;
  padding: 7px 14px;
  font-style: normal;
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.student-meta > span {
  background: #f4f6fa;
  color: #74819a;
}

.student-meta .group-chip {
  background: color-mix(in srgb, var(--grade-soft) 82%, #fff 18%);
  color: var(--grade-accent);
}

.student-section-badges {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.student-section-badges b,
.detail-section-badges b {
  display: inline-flex;
  max-width: 220px;
  align-items: center;
  overflow: hidden;
  border: 1px solid #d8d5f0;
  border-radius: 999px;
  background: #f6f4ff;
  color: #5d4b9a;
  padding: 5px 10px;
  font-size: 0.68rem;
  font-weight: 760;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-section-badges .badge-more {
  border-color: #dfe5ef;
  background: #f8fafc;
  color: #6f7b90;
}

.financial-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 7px;
}

.financial-label {
  color: #74819a;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.financial-balance {
  color: var(--grade-accent);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1.26rem;
  font-weight: 760;
  line-height: 1;
  text-align: right;
  white-space: nowrap;
}

.financial-balance.danger {
  color: var(--grade-accent);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  color: #c2cad8;
}

.row-actions button {
  display: flex;
  width: 62px;
  height: 62px;
  align-items: center;
  justify-content: center;
  border: 2px solid color-mix(in srgb, var(--grade-border) 88%, #ffffff 12%);
  border-radius: 20px;
  background: color-mix(in srgb, var(--grade-soft) 78%, #ffffff 22%);
  color: #26314f;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}

.student-row:hover .row-actions button {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}

.row-actions > svg {
  width: 20px;
  height: 20px;
  opacity: 0.7;
}

.student-row.compact .row-select-toggle {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border-width: 1.5px;
}

.student-row.compact .row-select-toggle span {
  width: 10px;
  height: 6px;
  border-width: 2px;
}

.student-row.compact .student-identity {
  gap: 12px;
}

.student-row.compact .student-grade-mark {
  width: 58px;
  height: 58px;
  border-radius: 18px;
}

.student-row.compact .student-grade-number {
  font-size: 1.9rem;
}

.student-row.compact .student-grade-label {
  margin-top: 3px;
  font-size: 0.56rem;
  letter-spacing: 0.16em;
}

.student-row.compact .student-copy {
  gap: 6px;
}

.student-row.compact .student-copy strong {
  font-size: 1rem;
}

.student-row.compact .student-meta {
  gap: 8px;
}

.student-row.compact .student-meta > span,
.student-row.compact .student-meta small {
  padding: 5px 10px;
  font-size: 0.72rem;
}

.student-row.compact .student-section-badges {
  display: none;
}

.student-row.compact .financial-cell {
  gap: 4px;
}

.student-row.compact .financial-label {
  font-size: 0.62rem;
}

.student-row.compact .financial-balance {
  font-size: 0.94rem;
}

.student-row.compact .row-actions {
  gap: 8px;
}

.student-row.compact .row-actions button {
  width: 38px;
  height: 38px;
  border-radius: 14px;
}
.empty-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  color: #66728a;
  font-size: 0.92rem;
  font-weight: 700;
}

.loading-state {
  flex-direction: column;
  gap: 12px;
}

.empty-state.muted {
  color: #9aa5b7;
}

.list-footer {
  display: flex;
  height: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #e8eef5;
  padding: 0 17px;
  color: #818b9b;
  font-size: 0.68rem;
  font-weight: 450;
}

.list-footer.selection-footer {
  border-top-color: #dde8f5;
  background: linear-gradient(90deg, rgba(246, 249, 255, 0.96), rgba(255, 255, 255, 0.96));
  color: #4b5f7a;
  font-weight: 680;
}

.selection-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.footer-action {
  display: inline-flex;
  height: 23px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #dce6f2;
  border-radius: 999px;
  background: #fff;
  color: #5e6d82;
  padding: 0 9px;
  font-size: 0.64rem;
  font-weight: 720;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.footer-action.primary:hover {
  border-color: #bacbe1;
  background: #f8fbff;
  color: #425b80;
}

.footer-action.icon {
  width: 23px;
  padding: 0;
}

.footer-action.icon:hover {
  border-color: #ead1cc;
  background: #fff6f4;
  color: #b85b4e;
}

.student-detail-panel {
  display: flex;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.filter-groups-enter-active,
.filter-groups-leave-active,
.detail-flow-enter-active,
.detail-flow-leave-active {
  transition: opacity 240ms ease, transform 240ms ease;
}

.filter-groups-enter-from,
.filter-groups-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.detail-flow-enter-from,
.detail-flow-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

@media (max-width: 1280px) {
  .students-screen {
    max-width: none;
  }

  .kpi-card {
    grid-template-columns: 40px minmax(0, 1fr);
    padding-right: 12px;
  }

  .kpi-icon {
    width: 34px;
    height: 34px;
  }

  .student-list-panel.is-compact {
    width: 352px;
    flex-basis: 352px;
  }
}

@media (max-height: 920px) and (min-width: 1081px) {
  .students-hero {
    min-height: 44px;
    padding-bottom: 5px;
  }

  .hero-copy h1 {
    font-size: 1.08rem;
  }

  .hero-copy p {
    font-size: 0.7rem;
  }

  .monthly-income {
    height: 42px;
    width: 198px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .monthly-income strong {
    font-size: 0.9rem;
  }

  .new-student-button {
    height: 40px;
  }

  .kpi-grid {
    gap: 8px;
    margin-bottom: 6px;
  }

  .kpi-card {
    min-height: 54px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .kpi-icon {
    width: 30px;
    height: 30px;
  }

  .kpi-text strong {
    font-size: 0.98rem;
  }

  .kpi-text em {
    margin-top: 2px;
    font-size: 0.6rem;
  }

  .filter-bar {
    min-height: 36px;
    margin-bottom: 5px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .active-filter-strip {
    min-height: 24px;
    margin-bottom: 5px;
  }

  .list-titlebar {
    height: 30px;
  }

  .list-columns {
    height: 20px;
  }

  .student-row {
    min-height: 92px;
  }

  .list-footer {
    height: 28px;
  }
}

@media (max-width: 820px) {
  .students-workspace {
    gap: 12px;
  }

  .student-list-scroll {
    padding-inline: 8px;
  }

  .list-columns {
    display: none;
  }

  .student-row,
  .student-row.full,
  .student-row.compact {
    grid-template-columns: minmax(0, 1fr) 116px 44px;
    min-height: 94px;
    gap: 12px;
    padding: 14px 14px;
    border-radius: 22px;
  }

  .student-identity {
    gap: 12px;
  }

  .row-select-toggle {
    width: 28px;
    height: 28px;
    border-radius: 10px;
    border-width: 1.5px;
  }

  .row-select-toggle span {
    width: 10px;
    height: 6px;
    border-width: 2px;
  }

  .student-grade-mark {
    width: 54px;
    height: 54px;
    border-radius: 18px;
  }

  .student-grade-number {
    font-size: 1.9rem;
  }

  .student-grade-label {
    margin-top: 3px;
    font-size: 0.58rem;
    letter-spacing: 0.17em;
  }

  .student-copy {
    gap: 6px;
  }

  .student-copy strong {
    font-size: 0.96rem;
  }

  .student-meta {
    gap: 8px;
  }

  .student-meta > span,
  .student-meta small {
    padding: 5px 10px;
    font-size: 0.72rem;
  }

  .student-section-badges {
    display: none;
  }

  .financial-cell {
    gap: 4px;
  }

  .financial-label {
    font-size: 0.62rem;
  }

  .financial-balance {
    font-size: 0.95rem;
  }

  .row-actions {
    gap: 8px;
  }

  .row-actions button {
    width: 38px;
    height: 38px;
    border-radius: 14px;
  }

  .selection-summary-shell {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .selection-summary-total {
    border-left: 0;
    border-top: 1px solid #d8e3f6;
    padding-left: 0;
    padding-top: 12px;
  }

  .selection-actions.hero {
    width: 100%;
    justify-self: stretch;
  }

  .footer-action.primary.big {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 1080px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .students-workspace {
    overflow: auto;
  }

  .student-list-panel.is-compact {
    display: none;
  }

  .filter-bar {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    align-items: flex-end;
    flex-direction: column;
    gap: 12px;
  }
}
.section-manage-button {
  height: 42px;
  min-width: 132px;
  border-radius: 10px;
  font-size: 0.86rem;
}

.student-section-badges {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  margin-top: 1px;
}

.student-section-badges b,
.detail-section-badges b {
  display: inline-flex;
  max-width: 116px;
  min-width: 0;
  flex: 0 1 auto;
  align-items: center;
  overflow: hidden;
  border: 1px solid #d8d5f0;
  border-radius: 999px;
  background: #f6f4ff;
  color: #5d4b9a;
  padding: 2px 7px;
  font-size: 0.54rem;
  font-weight: 760;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-section-badges .badge-more {
  max-width: none;
  flex: 0 0 auto;
  border-color: #dfe5ef;
  background: #f8fafc;
  color: #6f7b90;
}

.student-row.compact .student-grade-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
}

.student-row.compact .student-grade-number {
  font-size: 1.05rem;
}

.student-row.compact .student-section-badges b {
  max-width: 92px;
}

.section-modal-backdrop {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.34);
  padding: 20px;
}

.section-modal-card {
  width: min(460px, 94vw);
  max-height: min(620px, 90vh);
  overflow: hidden;
  border: 1px solid #e3eaf2;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.18);
}

.section-modal-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf2f7;
  padding: 16px 18px 12px;
}

.section-modal-card header span {
  color: #6d7890;
  font-size: 0.65rem;
  font-weight: 720;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.section-modal-card header h3 {
  margin: 4px 0 0;
  color: #26354f;
  font-size: 1rem;
  font-weight: 760;
}

.plain-icon-button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #66728a;
}

.plain-icon-button:hover {
  background: #f1f5f9;
  color: #26354f;
}

.section-create-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 14px 18px;
}

.section-create-row input {
  min-width: 0;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #fbfcfd;
  color: #172841;
  padding: 8px 10px;
  font-size: 0.78rem;
  outline: none;
}

.section-empty-state {
  margin: 0 18px 18px;
  border: 1px dashed #d7e1ed;
  border-radius: 12px;
  color: #7b879a;
  padding: 18px;
  text-align: center;
  font-size: 0.78rem;
}

.section-option-list {
  display: flex;
  max-height: 360px;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 0 18px 18px;
}

.section-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e6ecf3;
  border-radius: 12px;
  background: #fbfcfd;
  padding: 10px 12px;
}

.section-option span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.section-option strong {
  overflow: hidden;
  color: #26354f;
  font-size: 0.8rem;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-option em {
  color: #8995a8;
  font-size: 0.66rem;
  font-style: normal;
}

.section-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.section-check {
  position: relative;
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #dce5f0;
  border-radius: 9px;
  background: #fff;
  color: #fff;
  transition: border-color 150ms ease, background 150ms ease, opacity 150ms ease;
}

.section-check:disabled {
  opacity: 0.58;
}

.section-check.all {
  border-color: #7eb66b;
  background: #6aa957;
}

.section-check.some {
  border-color: #aebed3;
  background: #f7fafc;
}

.section-check span {
  width: 9px;
  height: 5px;
  border-bottom: 2px solid currentColor;
  border-left: 2px solid currentColor;
  opacity: 0;
  transform: rotate(-45deg) translate(1px, -1px);
}

.section-check.all span {
  opacity: 1;
}

.section-check.some span {
  width: 10px;
  height: 2px;
  border: 0;
  background: #64748b;
  opacity: 1;
  transform: none;
}

.section-delete {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #c95b4d;
}

.section-delete:hover {
  background: #fff0ed;
}


/* final responsive student card overrides */
.list-columns {
  display: grid !important;
  height: 22px !important;
  padding: 0 20px 4px !important;
  border-bottom: 0 !important;
}

.list-columns.compact,
.student-row.compact {
  grid-template-columns: minmax(0, 1fr) 122px 48px !important;
}

.list-columns.full,
.student-row.full {
  grid-template-columns: minmax(0, 1.8fr) 156px 56px !important;
}

.list-columns span:nth-child(2) {
  text-align: right !important;
}

.student-list-panel.is-compact {
  width: clamp(360px, 26vw, 392px) !important;
  flex: 0 0 clamp(360px, 26vw, 392px) !important;
}

.student-list-scroll {
  padding: 10px 10px 0 !important;
}

.student-row {
  min-height: 108px !important;
  gap: 16px !important;
  margin-bottom: 14px !important;
  border: 1px solid #e8edf4 !important;
  border-radius: 26px !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,253,0.98)) !important;
  padding: 18px 20px !important;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.04) !important;
}

.student-row:hover {
  border-color: #d8e3f0 !important;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.06) !important;
  transform: translateY(-1px);
}

.student-row.selected {
  border-color: #b9cffd !important;
  background: linear-gradient(135deg, rgba(243,247,255,0.99), rgba(255,255,255,0.98)) !important;
  box-shadow: 0 16px 40px rgba(66, 115, 232, 0.12) !important;
}

.student-row.compact {
  min-height: 92px !important;
  gap: 12px !important;
  padding: 14px 16px !important;
  border-radius: 22px !important;
}

.student-identity {
  gap: 16px !important;
}

.row-select-toggle {
  width: 48px !important;
  height: 48px !important;
  border: 2px solid #d8dde7 !important;
  border-radius: 16px !important;
  background: #fff !important;
  opacity: 1 !important;
}

.row-select-toggle.active {
  border-color: #2d6cf2 !important;
  background: linear-gradient(180deg, #2f78ff, #1f62eb) !important;
  box-shadow: 0 10px 22px rgba(47, 120, 255, 0.22) !important;
}

.row-select-toggle span {
  width: 13px !important;
  height: 8px !important;
  border-bottom: 3px solid currentColor !important;
  border-left: 3px solid currentColor !important;
}

.student-grade-mark {
  width: 106px !important;
  height: 106px !important;
  border-width: 2px !important;
  border-radius: 24px !important;
}

.student-grade-number {
  font-size: 3rem !important;
  line-height: 0.95 !important;
}

.student-grade-label {
  margin-top: 6px !important;
  font-size: 1rem !important;
  letter-spacing: 0.24em !important;
}

.student-copy {
  gap: 10px !important;
}

.student-copy strong {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  line-clamp: 2 !important;
  white-space: normal !important;
  font-size: 1.2rem !important;
  color: #12295c !important;
}

.student-meta {
  gap: 14px !important;
}

.student-meta > span,
.student-meta small {
  border-radius: 16px !important;
  padding: 7px 14px !important;
  font-size: 0.84rem !important;
  font-weight: 700 !important;
}

.student-meta > span {
  background: #f4f6fa !important;
  color: #74819a !important;
}

.student-meta .group-chip {
  background: color-mix(in srgb, var(--grade-soft) 82%, #fff 18%) !important;
  color: var(--grade-accent) !important;
}

.student-section-badges {
  flex-wrap: wrap !important;
  gap: 8px !important;
}

.student-section-badges b,
.detail-section-badges b {
  padding: 5px 10px !important;
  font-size: 0.68rem !important;
}

.financial-cell {
  gap: 7px !important;
  align-items: flex-end !important;
}

.financial-label {
  display: block !important;
  color: #74819a !important;
  font-size: 0.72rem !important;
  font-weight: 700 !important;
}

.financial-balance {
  color: var(--grade-accent) !important;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  font-size: 1.26rem !important;
  font-weight: 760 !important;
}

.row-actions {
  gap: 14px !important;
  color: #c2cad8 !important;
}

.row-actions button {
  width: 62px !important;
  height: 62px !important;
  border: 2px solid color-mix(in srgb, var(--grade-border) 88%, #ffffff 12%) !important;
  border-radius: 20px !important;
  background: color-mix(in srgb, var(--grade-soft) 78%, #ffffff 22%) !important;
  opacity: 1 !important;
}

.row-actions > svg {
  width: 20px !important;
  height: 20px !important;
  opacity: 0.7 !important;
}

.list-footer.selection-footer {
  position: sticky !important;
  bottom: 0 !important;
  z-index: 6 !important;
  display: block !important;
  margin-top: 14px !important;
  border: 1px solid #b9cffd !important;
  border-radius: 28px 28px 0 0 !important;
  background: linear-gradient(180deg, rgba(247,250,255,0.98), rgba(255,255,255,0.99)) !important;
  padding: 16px 18px 18px !important;
  box-shadow: 0 -10px 30px rgba(66, 115, 232, 0.08) !important;
}

.selection-summary-shell {
  display: grid !important;
  grid-template-columns: minmax(0, 1.3fr) minmax(150px, 0.72fr) auto !important;
  align-items: center !important;
  gap: 18px !important;
}

.selection-summary-main { display:flex !important; align-items:center !important; gap:16px !important; min-width:0 !important; }
.selection-avatar { width:72px !important; height:72px !important; border-radius:999px !important; background: linear-gradient(180deg, #2f78ff, #1f62eb) !important; color:#fff !important; }
.selection-avatar-count { display:inline-flex !important; }
.selection-summary-copy { display:flex !important; flex-direction:column !important; gap:6px !important; min-width:0 !important; }
.selection-summary-copy small { color:#2f78ff !important; font-size:0.84rem !important; font-weight:700 !important; }
.selection-summary-copy strong { font-size:1.02rem !important; color:#12295c !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }
.selection-summary-copy em { font-style:normal !important; color:#74819a !important; font-size:0.8rem !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }
.selection-summary-total { display:flex !important; flex-direction:column !important; gap:8px !important; border-left:1px solid #d8e3f6 !important; padding-left:18px !important; }
.selection-summary-total small { color:#74819a !important; font-size:0.8rem !important; font-weight:700 !important; }
.selection-summary-total strong { color:#2f78ff !important; font-size:1.1rem !important; font-weight:780 !important; }
.selection-actions.hero { justify-self:end !important; display:inline-flex !important; align-items:center !important; gap:10px !important; }
.footer-action { height:46px !important; border-radius:999px !important; padding:0 16px !important; }
.footer-action.primary.big { height:58px !important; min-width:190px !important; padding:0 24px !important; font-size:0.98rem !important; background:linear-gradient(180deg, #2f78ff, #1f62eb) !important; color:#fff !important; }
.footer-action.ghost { width:48px !important; padding:0 !important; }

@media (max-width: 820px) {
  .list-columns { display:none !important; }
  .student-row,
  .student-row.full,
  .student-row.compact { grid-template-columns: minmax(0, 1fr) 116px 44px !important; min-height:94px !important; gap:12px !important; padding:14px !important; border-radius:22px !important; }
  .student-identity { gap:12px !important; }
  .row-select-toggle { width:28px !important; height:28px !important; border-radius:10px !important; border-width:1.5px !important; }
  .row-select-toggle span { width:10px !important; height:6px !important; border-width:2px !important; }
  .student-grade-mark { width:54px !important; height:54px !important; border-radius:18px !important; }
  .student-grade-number { font-size:1.9rem !important; }
  .student-grade-label { margin-top:3px !important; font-size:0.58rem !important; letter-spacing:0.17em !important; }
  .student-copy { gap:6px !important; }
  .student-copy strong { font-size:0.96rem !important; }
  .student-meta { gap:8px !important; }
  .student-meta > span, .student-meta small { padding:5px 10px !important; font-size:0.72rem !important; }
  .student-section-badges { display:none !important; }
  .financial-cell { gap:4px !important; }
  .financial-label { font-size:0.62rem !important; }
  .financial-balance { font-size:0.95rem !important; }
  .row-actions { gap:8px !important; }
  .row-actions button { width:38px !important; height:38px !important; border-radius:14px !important; }
  .selection-summary-shell { grid-template-columns:1fr !important; gap:14px !important; }
  .selection-summary-total { border-left:0 !important; border-top:1px solid #d8e3f6 !important; padding-left:0 !important; padding-top:12px !important; }
  .selection-actions.hero { width:100% !important; justify-self:stretch !important; }
  .footer-action.primary.big { min-width:0 !important; width:100% !important; }
}



/* final exact student list composition */
.student-list-panel.is-full,
.student-list-panel.is-compact {
  width: min(100%, 680px) !important;
  flex: 0 0 min(100%, 680px) !important;
  margin: 0 auto !important;
}

.student-list-panel.is-compact {
  width: min(100%, 680px) !important;
  flex-basis: min(100%, 680px) !important;
}

.student-list-card {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.list-titlebar,
.list-columns {
  display: none !important;
}

.student-list-scroll {
  position: relative !important;
  display: flex !important;
  flex: 1 !important;
  min-height: 0 !important;
  flex-direction: column !important;
  overflow-y: auto !important;
  padding: 12px 18px 22px 56px !important;
  background: transparent !important;
  scrollbar-color: #cbd5e1 transparent !important;
  scrollbar-width: thin !important;
}

.student-list-scroll::before {
  content: "";
  position: absolute;
  left: 28px;
  top: 24px;
  bottom: 26px;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, #d8e9ff, #e2f3d6 42%, #eadcff 78%, #edf2f7);
}

.student-row,
.student-row.full,
.student-row.compact {
  position: relative !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 142px 34px !important;
  min-height: 76px !important;
  align-items: center !important;
  gap: 12px !important;
  margin: 0 0 8px !important;
  border: 1px solid transparent !important;
  border-bottom-color: #edf2f7 !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 10px 10px 10px 0 !important;
  box-shadow: none !important;
  transform: none !important;
  transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease !important;
}

.student-row:hover {
  background: rgba(255, 255, 255, 0.76) !important;
  border-color: #e8f0f8 !important;
  border-radius: 14px !important;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.045) !important;
}

.student-row.selected,
.student-row.multi-selected,
.student-row.selected.multi-selected {
  border-color: #b9d7ff !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, #f7fbff 0%, #ffffff 100%) !important;
  box-shadow: 0 14px 32px rgba(47, 120, 255, 0.12) !important;
}

.student-identity {
  display: flex !important;
  min-width: 0 !important;
  align-items: center !important;
  gap: 16px !important;
}

.row-select-toggle {
  position: absolute !important;
  left: -36px !important;
  top: 50% !important;
  z-index: 2 !important;
  width: 15px !important;
  height: 15px !important;
  border: 2px solid #d9e1eb !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  color: #ffffff !important;
  box-shadow: 0 0 0 4px #ffffff !important;
  opacity: 1 !important;
  transform: translateY(-50%) !important;
}

.row-select-toggle:hover {
  transform: translateY(-50%) scale(1.08) !important;
}

.row-select-toggle.active {
  border-color: #2f78ff !important;
  background: #2f78ff !important;
  box-shadow: 0 0 0 4px #eaf3ff, 0 4px 10px rgba(47, 120, 255, 0.28) !important;
}

.row-select-toggle span {
  width: 5px !important;
  height: 3px !important;
  border-left: 1.5px solid currentColor !important;
  border-bottom: 1.5px solid currentColor !important;
  opacity: 0 !important;
  transform: rotate(-45deg) translate(0, -1px) !important;
}

.row-select-toggle.active span {
  opacity: 1 !important;
}

.student-grade-mark {
  width: 56px !important;
  height: 56px !important;
  flex: 0 0 56px !important;
  border: 1px solid var(--grade-border) !important;
  border-radius: 12px !important;
  background: linear-gradient(180deg, var(--grade-soft) 0%, #ffffff 100%) !important;
  color: var(--grade-accent) !important;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.04) !important;
}

.student-grade-number {
  font-size: 1.52rem !important;
  font-weight: 820 !important;
  line-height: 0.95 !important;
  letter-spacing: -0.04em !important;
}

.student-grade-label {
  margin-top: 4px !important;
  color: var(--grade-accent) !important;
  font-size: 0.52rem !important;
  font-weight: 780 !important;
  letter-spacing: 0.16em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.student-copy {
  display: flex !important;
  min-width: 0 !important;
  flex-direction: column !important;
  gap: 7px !important;
}

.student-copy strong {
  display: block !important;
  overflow: hidden !important;
  color: #1d2e49 !important;
  font-size: 0.88rem !important;
  font-weight: 760 !important;
  line-height: 1.15 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.student-meta {
  display: flex !important;
  min-width: 0 !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: nowrap !important;
}

.student-meta > span,
.student-meta small {
  display: inline-flex !important;
  height: 18px !important;
  max-width: 130px !important;
  align-items: center !important;
  overflow: hidden !important;
  border-radius: 999px !important;
  padding: 0 8px !important;
  font-size: 0.58rem !important;
  font-style: normal !important;
  font-weight: 760 !important;
  line-height: 18px !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.student-meta > span {
  background: #eef3fa !important;
  color: #5d6f89 !important;
}

.student-meta .group-chip {
  background: var(--grade-soft) !important;
  color: var(--grade-accent) !important;
}

.student-section-badges {
  display: none !important;
}

.financial-cell {
  display: flex !important;
  min-width: 0 !important;
  height: 48px !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: center !important;
  gap: 4px !important;
  border: 0 !important;
  border-left: 1px solid #dfe7f0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 0 0 0 16px !important;
}

.financial-label {
  display: block !important;
  color: #74819a !important;
  font-size: 0.58rem !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}

.financial-balance {
  color: var(--grade-accent) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 0.98rem !important;
  font-weight: 820 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}

.financial-balance.danger {
  color: var(--grade-accent) !important;
}

.row-actions {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  color: #a7b0bf !important;
}

.row-actions button {
  display: none !important;
}

.row-actions > svg {
  display: inline-flex !important;
  width: 24px !important;
  height: 24px !important;
  box-sizing: border-box !important;
  border: 1px solid #e5ecf3 !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  color: #9aa6b5 !important;
  padding: 6px !important;
  opacity: 1 !important;
  filter: drop-shadow(0 3px 8px rgba(15, 23, 42, 0.06)) !important;
}

.student-row.selected .row-actions > svg {
  border-color: transparent !important;
  background: #2f78ff !important;
  color: #ffffff !important;
  filter: drop-shadow(0 4px 10px rgba(47, 120, 255, 0.28)) !important;
}

.list-footer.selection-footer {
  margin: 8px 12px 0 56px !important;
  border: 1px solid #b9d7ff !important;
  border-radius: 14px !important;
  background: #f7fbff !important;
  padding: 10px 12px !important;
  box-shadow: 0 10px 24px rgba(47, 120, 255, 0.1) !important;
}

.selection-summary-shell {
  grid-template-columns: minmax(0, 1fr) auto auto !important;
  gap: 14px !important;
}

.selection-avatar {
  width: 42px !important;
  height: 42px !important;
}

.selection-avatar-count {
  min-width: 18px !important;
  height: 18px !important;
  border-width: 2px !important;
  font-size: 0.66rem !important;
}

.selection-summary-copy small,
.selection-summary-total small {
  font-size: 0.62rem !important;
}

.selection-summary-copy strong {
  font-size: 0.78rem !important;
}

.selection-summary-copy em {
  font-size: 0.64rem !important;
}

.selection-summary-total strong {
  font-size: 0.9rem !important;
}

.footer-action.primary.big {
  height: 36px !important;
  min-width: 110px !important;
  padding: 0 14px !important;
  font-size: 0.72rem !important;
}

@media (max-width: 820px) {
  .student-list-panel.is-full,
  .student-list-panel.is-compact {
    width: 100% !important;
    flex-basis: 100% !important;
  }

  .student-list-scroll {
    padding: 12px 10px 20px 42px !important;
  }

  .student-list-scroll::before {
    left: 20px !important;
  }

  .student-row,
  .student-row.full,
  .student-row.compact {
    grid-template-columns: minmax(0, 1fr) 116px 28px !important;
    min-height: 70px !important;
    gap: 8px !important;
    padding: 8px 8px 8px 0 !important;
    margin-bottom: 7px !important;
  }

  .student-identity {
    gap: 10px !important;
  }

  .row-select-toggle {
    left: -29px !important;
    width: 13px !important;
    height: 13px !important;
  }

  .student-grade-mark {
    width: 48px !important;
    height: 48px !important;
    flex-basis: 48px !important;
    border-radius: 11px !important;
  }

  .student-grade-number {
    font-size: 1.34rem !important;
  }

  .student-grade-label {
    font-size: 0.47rem !important;
  }

  .student-copy strong {
    font-size: 0.76rem !important;
  }

  .student-meta {
    gap: 6px !important;
  }

  .student-meta > span,
  .student-meta small {
    height: 16px !important;
    max-width: 96px !important;
    padding: 0 6px !important;
    font-size: 0.5rem !important;
    line-height: 16px !important;
  }

  .financial-cell {
    height: 42px !important;
    padding-left: 10px !important;
  }

  .financial-label {
    font-size: 0.5rem !important;
  }

  .financial-balance {
    font-size: 0.78rem !important;
  }

  .row-actions > svg {
    width: 22px !important;
    height: 22px !important;
    padding: 5px !important;
  }

  .list-footer.selection-footer {
    margin-left: 42px !important;
  }

  .selection-summary-shell {
    grid-template-columns: minmax(0, 1fr) auto !important;
  }

  .selection-summary-total {
    display: none !important;
  }
}



/* final selection spacing and responsive selected bar stabilization */
.student-list-card {
  overflow: visible !important;
}

.student-list-scroll {
  padding-left: 72px !important;
  padding-bottom: 18px !important;
}

.student-list-scroll::before {
  left: 34px !important;
}

.student-row,
.student-row.full,
.student-row.compact {
  margin-bottom: 9px !important;
}

.student-row:last-child {
  margin-bottom: 10px !important;
}

.row-select-toggle {
  left: -44px !important;
}

.student-identity {
  gap: 18px !important;
}

.list-footer.selection-footer {
  position: relative !important;
  bottom: auto !important;
  z-index: 4 !important;
  box-sizing: border-box !important;
  width: auto !important;
  min-height: 58px !important;
  margin: 12px 18px 12px 72px !important;
  overflow: visible !important;
  border-radius: 16px !important;
  padding: 10px 12px !important;
}

.selection-summary-shell {
  display: grid !important;
  width: 100% !important;
  min-width: 0 !important;
  grid-template-columns: minmax(0, 1fr) minmax(118px, auto) minmax(122px, auto) !important;
  align-items: center !important;
  gap: 14px !important;
}

.selection-summary-main,
.selection-summary-copy,
.selection-summary-total,
.selection-actions.hero {
  min-width: 0 !important;
}

.selection-summary-copy strong,
.selection-summary-copy em {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.selection-summary-total {
  border-left: 1px solid #d8e3f6 !important;
  padding-left: 14px !important;
}

.selection-actions.hero {
  justify-self: end !important;
  flex-wrap: nowrap !important;
}

.footer-action.primary.big {
  max-width: 160px !important;
  white-space: nowrap !important;
}

@media (max-width: 820px) {
  .student-list-scroll {
    padding-left: 54px !important;
    padding-bottom: 16px !important;
  }

  .student-list-scroll::before {
    left: 26px !important;
  }

  .row-select-toggle {
    left: -35px !important;
  }

  .student-identity {
    gap: 12px !important;
  }

  .list-footer.selection-footer {
    margin: 10px 10px 12px 54px !important;
    padding: 9px 10px !important;
  }

  .selection-summary-shell {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 10px !important;
  }

  .selection-summary-total {
    display: flex !important;
    grid-column: 1 / -1 !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    border-left: 0 !important;
    border-top: 1px solid #d8e3f6 !important;
    padding: 8px 0 0 !important;
  }

  .selection-actions.hero {
    grid-column: 2 !important;
    grid-row: 1 !important;
  }

  .footer-action.ghost {
    display: none !important;
  }

  .footer-action.primary.big {
    width: auto !important;
    min-width: 98px !important;
    max-width: 120px !important;
    height: 34px !important;
    padding: 0 12px !important;
  }
}

@media (max-width: 520px) {
  .student-list-scroll {
    padding-left: 48px !important;
  }

  .student-list-scroll::before {
    left: 23px !important;
  }

  .row-select-toggle {
    left: -31px !important;
  }

  .list-footer.selection-footer {
    margin-left: 48px !important;
    margin-right: 8px !important;
  }

  .selection-summary-shell {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .selection-actions.hero {
    grid-column: 1 !important;
    grid-row: auto !important;
    justify-self: stretch !important;
    width: 100% !important;
  }

  .footer-action.primary.big {
    width: 100% !important;
    max-width: none !important;
  }
}



/* v12 serious scaling pass: stable split, no overlay, no visual squeeze */
.students-screen {
  max-width: min(100%, 1680px) !important;
  padding-inline: clamp(8px, 1.2vw, 18px) !important;
}

.students-workspace {
  display: grid !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
  grid-template-columns: minmax(0, 1fr) !important;
  align-items: stretch !important;
  gap: clamp(12px, 1.2vw, 18px) !important;
  overflow: hidden !important;
}

.students-workspace.has-detail {
  grid-template-columns: clamp(390px, 34vw, 660px) minmax(0, 1fr) !important;
}

.students-workspace.has-detail .student-list-panel,
.students-workspace:not(.has-detail) .student-list-panel {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  flex: initial !important;
  flex-basis: auto !important;
  margin: 0 !important;
}

.students-workspace:not(.has-detail) .student-list-panel {
  max-width: 760px !important;
  justify-self: center !important;
}

.students-workspace.has-detail .student-detail-panel {
  display: flex !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  border-radius: 18px !important;
  border-color: #dfe8f4 !important;
  background: rgba(255,255,255,0.96) !important;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.055) !important;
}

.students-workspace.has-detail .student-list-card {
  max-width: none !important;
}

.students-workspace.has-detail .student-list-scroll {
  padding-left: clamp(42px, 4.1vw, 64px) !important;
  padding-right: clamp(8px, 0.8vw, 14px) !important;
}

.students-workspace.has-detail .student-list-scroll::before {
  left: clamp(20px, 2vw, 31px) !important;
}

.students-workspace.has-detail .row-select-toggle {
  left: clamp(-39px, -2.7vw, -31px) !important;
}

.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  grid-template-columns: minmax(0, 1fr) clamp(108px, 9.2vw, 142px) 30px !important;
  min-height: clamp(68px, 6.1vw, 76px) !important;
  gap: clamp(7px, 0.85vw, 12px) !important;
  padding-right: clamp(6px, 0.9vw, 10px) !important;
}

.students-workspace.has-detail .student-identity {
  gap: clamp(10px, 1.2vw, 16px) !important;
}

.students-workspace.has-detail .student-grade-mark {
  width: clamp(48px, 4.6vw, 56px) !important;
  height: clamp(48px, 4.6vw, 56px) !important;
  flex-basis: clamp(48px, 4.6vw, 56px) !important;
}

.students-workspace.has-detail .student-grade-number {
  font-size: clamp(1.32rem, 2.1vw, 1.52rem) !important;
}

.students-workspace.has-detail .student-grade-label {
  font-size: clamp(0.46rem, 0.66vw, 0.52rem) !important;
}

.students-workspace.has-detail .student-copy strong {
  font-size: clamp(0.74rem, 1.05vw, 0.88rem) !important;
}

.students-workspace.has-detail .student-meta {
  gap: clamp(5px, 0.7vw, 8px) !important;
}

.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  height: clamp(16px, 1.5vw, 18px) !important;
  max-width: clamp(74px, 8.8vw, 130px) !important;
  padding-inline: clamp(5px, 0.55vw, 8px) !important;
  font-size: clamp(0.49rem, 0.68vw, 0.58rem) !important;
}

.students-workspace.has-detail .financial-cell {
  height: clamp(40px, 4.1vw, 48px) !important;
  padding-left: clamp(8px, 1.2vw, 16px) !important;
}

.students-workspace.has-detail .financial-label {
  font-size: clamp(0.48rem, 0.65vw, 0.58rem) !important;
}

.students-workspace.has-detail .financial-balance {
  font-size: clamp(0.74rem, 1.12vw, 0.98rem) !important;
}

.students-workspace.has-detail .row-actions > svg {
  width: clamp(21px, 2.1vw, 24px) !important;
  height: clamp(21px, 2.1vw, 24px) !important;
}

.selection-actions.hero {
  display: inline-flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 8px !important;
}

.footer-action.soft {
  height: 34px !important;
  min-width: 88px !important;
  border: 1px solid #dbe8ff !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  color: #2f78ff !important;
  padding: 0 11px !important;
  font-size: 0.68rem !important;
  font-weight: 760 !important;
  box-shadow: none !important;
}

.footer-action.primary.big {
  min-width: 102px !important;
  height: 34px !important;
  padding: 0 12px !important;
  font-size: 0.68rem !important;
}

.students-workspace.has-detail .list-footer.selection-footer {
  margin-left: clamp(42px, 4.1vw, 64px) !important;
  margin-right: clamp(8px, 0.8vw, 14px) !important;
}

.students-workspace.has-detail .selection-summary-shell {
  grid-template-columns: minmax(0, 1fr) auto !important;
  gap: 10px !important;
}

.students-workspace.has-detail .selection-summary-total {
  display: none !important;
}

.students-workspace.has-detail .selection-actions.hero {
  grid-column: 1 / -1 !important;
  justify-self: stretch !important;
  justify-content: space-between !important;
  gap: 7px !important;
}

.students-workspace.has-detail .footer-action.soft,
.students-workspace.has-detail .footer-action.primary.big {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  max-width: none !important;
}

@media (max-width: 1120px) and (min-width: 821px) {
  .students-workspace.has-detail {
    grid-template-columns: clamp(360px, 38vw, 430px) minmax(0, 1fr) !important;
  }

  .students-workspace.has-detail .student-row,
  .students-workspace.has-detail .student-row.full,
  .students-workspace.has-detail .student-row.compact {
    grid-template-columns: minmax(0, 1fr) 104px 26px !important;
  }

  .students-workspace.has-detail .financial-label {
    display: none !important;
  }
}

@media (max-width: 900px) and (min-width: 821px) {
  .students-workspace.has-detail {
    grid-template-columns: 1fr !important;
    overflow-y: auto !important;
  }

  .students-workspace.has-detail .student-list-panel,
  .students-workspace.has-detail .student-detail-panel {
    min-height: 420px !important;
  }
}

@media (max-width: 820px) {
  .students-screen {
    padding-inline: 0 !important;
  }

  .students-workspace,
  .students-workspace.has-detail {
    grid-template-columns: 1fr !important;
    overflow-y: auto !important;
    gap: 12px !important;
  }

  .students-workspace.has-detail .student-detail-panel {
    min-height: 70vh !important;
    border-radius: 16px !important;
  }

  .selection-actions.hero {
    flex-wrap: wrap !important;
  }

  .footer-action.soft,
  .footer-action.primary.big {
    flex: 1 1 30% !important;
  }
}


/* v13 fixed-artboard scaling pass
   The student workspace is rendered as a stable design canvas and uniformly scaled.
   This prevents desktop-size / OS-scaling compression from changing the visual hierarchy. */
.students-screen {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-x: hidden !important;
  padding-inline: clamp(8px, 1.2vw, 18px) !important;
}

.students-scale-shell {
  position: relative !important;
  width: 100% !important;
  min-height: 420px !important;
  overflow: hidden !important;
  flex: 1 1 auto !important;
  contain: layout paint !important;
}

.students-design-canvas {
  position: relative !important;
  transform-origin: top left !important;
  will-change: transform !important;
}

.students-design-canvas > .students-workspace,
.students-workspace,
.students-workspace.has-detail {
  display: grid !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  align-items: stretch !important;
  overflow: hidden !important;
  gap: 18px !important;
}

.students-workspace:not(.has-detail) {
  grid-template-columns: 760px !important;
  justify-content: center !important;
}

.students-workspace.has-detail {
  grid-template-columns: 760px minmax(0, 1fr) !important;
}

.students-workspace .student-list-panel,
.students-workspace .student-list-panel.is-full,
.students-workspace .student-list-panel.is-compact {
  display: flex !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  height: 100% !important;
  min-height: 0 !important;
  flex: initial !important;
  flex-basis: auto !important;
  margin: 0 !important;
  justify-self: stretch !important;
}

.student-list-card {
  height: 100% !important;
  min-height: 0 !important;
  border-radius: 22px !important;
  border-color: #e3ebf5 !important;
  background: rgba(255,255,255,0.96) !important;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.045) !important;
}

.list-titlebar {
  min-height: 52px !important;
  padding: 0 18px !important;
}

.list-columns,
.list-columns.full,
.list-columns.compact {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 138px 34px !important;
  height: 24px !important;
  align-items: center !important;
  padding: 0 18px 0 58px !important;
  border-bottom: 0 !important;
  color: #7b8798 !important;
  font-size: 0.58rem !important;
  font-weight: 720 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
}

.list-columns span:nth-child(2) {
  text-align: right !important;
}

.student-list-scroll {
  position: relative !important;
  display: flex !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 12px 14px 18px 58px !important;
  scrollbar-color: #cbd5e1 transparent !important;
  scrollbar-width: thin !important;
}

.student-list-scroll::before {
  content: "" !important;
  position: absolute !important;
  top: 18px !important;
  bottom: 18px !important;
  left: 31px !important;
  width: 1px !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, transparent, #dbe5f1 10%, #dbe5f1 90%, transparent) !important;
}

.student-row,
.student-row.full,
.student-row.compact,
.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  position: relative !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 138px 34px !important;
  min-height: 78px !important;
  align-items: center !important;
  gap: 12px !important;
  margin: 0 0 10px 0 !important;
  border: 1px solid #e8edf4 !important;
  border-radius: 20px !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.99), rgba(248,250,253,0.98)) !important;
  padding: 10px 12px 10px 14px !important;
  box-shadow: 0 9px 24px rgba(15, 23, 42, 0.045) !important;
  cursor: pointer !important;
  user-select: none !important;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease !important;
}

.student-row:hover {
  border-color: #d8e3f0 !important;
  box-shadow: 0 13px 28px rgba(15, 23, 42, 0.065) !important;
  transform: translateY(-1px) !important;
}

.student-row.selected,
.student-row.selected.multi-selected {
  border-color: #b9cffd !important;
  background: linear-gradient(135deg, rgba(243,247,255,0.99), rgba(255,255,255,0.98)) !important;
  box-shadow: 0 14px 34px rgba(66, 115, 232, 0.12) !important;
}

.student-row.multi-selected:not(.selected) {
  border-color: #d8e3f6 !important;
  background: linear-gradient(135deg, rgba(249,250,252,0.99), rgba(255,255,255,0.98)) !important;
}

.student-row.inactive {
  background: linear-gradient(135deg, rgba(255,249,248,0.98), rgba(255,255,255,0.98)) !important;
}

.student-row.unenrolled {
  background: linear-gradient(135deg, rgba(255,252,246,0.98), rgba(255,255,255,0.98)) !important;
}

.row-select-toggle,
.students-workspace.has-detail .row-select-toggle {
  position: absolute !important;
  left: -38px !important;
  top: 50% !important;
  display: inline-flex !important;
  width: 18px !important;
  height: 18px !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: center !important;
  border: 2px solid #cfd8e6 !important;
  border-radius: 999px !important;
  background: #fff !important;
  color: #fff !important;
  opacity: 1 !important;
  transform: translateY(-50%) !important;
  box-shadow: 0 0 0 5px #fff !important;
}

.row-select-toggle.active {
  border-color: #2f78ff !important;
  background: linear-gradient(180deg, #2f78ff, #1f62eb) !important;
  box-shadow: 0 0 0 5px #fff, 0 8px 18px rgba(47, 120, 255, 0.22) !important;
}

.row-select-toggle span,
.students-workspace.has-detail .row-select-toggle span {
  width: 8px !important;
  height: 5px !important;
  border-bottom: 2px solid currentColor !important;
  border-left: 2px solid currentColor !important;
  opacity: 0 !important;
  transform: rotate(-45deg) translate(1px, -1px) !important;
}

.row-select-toggle.active span {
  opacity: 1 !important;
}

.student-identity,
.students-workspace.has-detail .student-identity {
  display: flex !important;
  min-width: 0 !important;
  align-items: center !important;
  gap: 12px !important;
}

.student-grade-mark,
.students-workspace.has-detail .student-grade-mark {
  display: flex !important;
  width: 56px !important;
  height: 56px !important;
  flex: 0 0 56px !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  border: 1.5px solid var(--grade-border) !important;
  border-radius: 18px !important;
  background: linear-gradient(180deg, color-mix(in srgb, var(--grade-soft) 86%, #fff 14%) 0%, #ffffff 100%) !important;
  color: var(--grade-accent) !important;
}

.student-grade-number,
.students-workspace.has-detail .student-grade-number {
  font-size: 1.84rem !important;
  font-weight: 820 !important;
  line-height: 0.96 !important;
  letter-spacing: -0.05em !important;
}

.student-grade-label,
.students-workspace.has-detail .student-grade-label {
  margin-top: 3px !important;
  color: color-mix(in srgb, var(--grade-accent) 72%, #64748b 28%) !important;
  font-size: 0.54rem !important;
  font-weight: 780 !important;
  letter-spacing: 0.15em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.student-copy,
.students-workspace.has-detail .student-copy {
  display: flex !important;
  min-width: 0 !important;
  flex-direction: column !important;
  gap: 6px !important;
}

.student-copy strong,
.students-workspace.has-detail .student-copy strong {
  display: -webkit-box !important;
  overflow: hidden !important;
  color: #12295c !important;
  font-size: 0.92rem !important;
  font-weight: 760 !important;
  line-height: 1.1 !important;
  text-overflow: ellipsis !important;
  white-space: normal !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  line-clamp: 2 !important;
}

.student-meta,
.students-workspace.has-detail .student-meta {
  display: flex !important;
  min-width: 0 !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
}

.student-meta > span,
.student-meta small,
.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  display: inline-flex !important;
  height: 22px !important;
  max-width: none !important;
  align-items: center !important;
  border-radius: 999px !important;
  padding: 0 9px !important;
  font-style: normal !important;
  font-size: 0.66rem !important;
  font-weight: 720 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}

.student-meta > span {
  background: #f4f6fa !important;
  color: #74819a !important;
}

.student-meta .group-chip {
  background: color-mix(in srgb, var(--grade-soft) 82%, #fff 18%) !important;
  color: var(--grade-accent) !important;
}

.student-section-badges {
  display: flex !important;
  min-width: 0 !important;
  flex-wrap: nowrap !important;
  gap: 5px !important;
  overflow: hidden !important;
}

.student-section-badges b,
.detail-section-badges b {
  display: inline-flex !important;
  max-width: 128px !important;
  align-items: center !important;
  overflow: hidden !important;
  border: 1px solid #d8d5f0 !important;
  border-radius: 999px !important;
  background: #f6f4ff !important;
  color: #5d4b9a !important;
  padding: 3px 8px !important;
  font-size: 0.56rem !important;
  font-weight: 760 !important;
  line-height: 1.1 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.financial-cell,
.students-workspace.has-detail .financial-cell {
  display: flex !important;
  min-width: 0 !important;
  height: 48px !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  justify-content: center !important;
  gap: 4px !important;
  border-left: 1px solid #e8eef6 !important;
  padding-left: 14px !important;
}

.financial-label,
.students-workspace.has-detail .financial-label {
  display: block !important;
  color: #74819a !important;
  font-size: 0.56rem !important;
  font-weight: 720 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}

.financial-balance,
.students-workspace.has-detail .financial-balance {
  color: var(--grade-accent) !important;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  font-size: 0.98rem !important;
  font-weight: 780 !important;
  line-height: 1 !important;
  text-align: right !important;
  white-space: nowrap !important;
}

.row-actions,
.students-workspace.has-detail .row-actions {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  color: #c2cad8 !important;
}

.row-actions button {
  display: flex !important;
  width: 36px !important;
  height: 36px !important;
  align-items: center !important;
  justify-content: center !important;
  border: 1px solid color-mix(in srgb, var(--grade-border) 88%, #ffffff 12%) !important;
  border-radius: 13px !important;
  background: color-mix(in srgb, var(--grade-soft) 78%, #ffffff 22%) !important;
  color: #26314f !important;
  opacity: 1 !important;
}

.row-actions > svg,
.students-workspace.has-detail .row-actions > svg {
  width: 21px !important;
  height: 21px !important;
  opacity: 0.72 !important;
}

.student-detail-panel,
.students-workspace.has-detail .student-detail-panel {
  display: flex !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  border-radius: 22px !important;
  border-color: #e3ebf5 !important;
  background: rgba(255,255,255,0.96) !important;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.05) !important;
}

.student-detail-panel > * {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
}

.list-footer.selection-footer,
.students-workspace.has-detail .list-footer.selection-footer {
  position: sticky !important;
  bottom: 0 !important;
  z-index: 6 !important;
  display: block !important;
  margin: 10px 14px 0 58px !important;
  border: 1px solid #b9cffd !important;
  border-radius: 22px 22px 0 0 !important;
  background: linear-gradient(180deg, rgba(247,250,255,0.98), rgba(255,255,255,0.99)) !important;
  padding: 12px 14px !important;
  box-shadow: 0 -10px 30px rgba(66, 115, 232, 0.08) !important;
}

.selection-summary-shell,
.students-workspace.has-detail .selection-summary-shell {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  align-items: center !important;
  gap: 10px !important;
}

.selection-summary-main {
  display: flex !important;
  min-width: 0 !important;
  align-items: center !important;
  gap: 10px !important;
}

.selection-avatar {
  width: 42px !important;
  height: 42px !important;
  flex: 0 0 42px !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #2f78ff, #1f62eb) !important;
  color: #fff !important;
  box-shadow: 0 10px 22px rgba(47, 120, 255, 0.2) !important;
}

.selection-avatar-count {
  top: -5px !important;
  right: -5px !important;
  min-width: 20px !important;
  height: 20px !important;
  border-width: 2px !important;
  font-size: 0.64rem !important;
}

.selection-summary-copy small {
  color: #2f78ff !important;
  font-size: 0.62rem !important;
  font-weight: 760 !important;
}

.selection-summary-copy strong {
  max-width: 210px !important;
  color: #12295c !important;
  font-size: 0.76rem !important;
  font-weight: 760 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.selection-summary-copy em {
  color: #74819a !important;
  font-size: 0.62rem !important;
  font-style: normal !important;
}

.selection-summary-total,
.students-workspace.has-detail .selection-summary-total {
  display: none !important;
}

.selection-actions.hero,
.students-workspace.has-detail .selection-actions.hero {
  grid-column: 1 / -1 !important;
  display: flex !important;
  justify-self: stretch !important;
  justify-content: stretch !important;
  gap: 8px !important;
  flex-wrap: nowrap !important;
}

.footer-action.soft,
.footer-action.primary.big,
.students-workspace.has-detail .footer-action.soft,
.students-workspace.has-detail .footer-action.primary.big {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  height: 34px !important;
  border-radius: 999px !important;
  padding: 0 10px !important;
  font-size: 0.66rem !important;
  font-weight: 760 !important;
  white-space: nowrap !important;
}

.footer-action.soft {
  border: 1px solid #dbe8ff !important;
  background: #ffffff !important;
  color: #2f78ff !important;
  box-shadow: none !important;
}

.footer-action.primary.big {
  border-color: transparent !important;
  background: linear-gradient(180deg, #2f78ff, #1f62eb) !important;
  color: #fff !important;
  box-shadow: 0 10px 20px rgba(47, 120, 255, 0.18) !important;
}


/* v14 scaling refinement: preserve the design, make detail dominant, keep KPI cards one row. */
.kpi-grid {
  display: grid !important;
  grid-auto-flow: column !important;
  grid-auto-columns: minmax(128px, 1fr) !important;
  grid-template-columns: none !important;
  grid-template-rows: 1fr !important;
  gap: 8px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  padding-bottom: 4px !important;
  scrollbar-width: thin !important;
  scroll-snap-type: x proximity !important;
}

.kpi-card {
  min-width: 128px !important;
  min-height: 54px !important;
  grid-template-columns: 30px minmax(0, 1fr) !important;
  gap: 7px !important;
  scroll-snap-align: start !important;
}

.kpi-icon {
  width: 30px !important;
  height: 30px !important;
}

.kpi-text span,
.kpi-text strong,
.kpi-text em {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.active-filter-strip:empty {
  display: none !important;
}

.students-workspace.has-detail {
  grid-template-columns: 570px minmax(0, 1fr) !important;
  gap: 18px !important;
}

.students-workspace.has-detail .student-list-panel,
.students-workspace.has-detail .student-list-panel.is-compact {
  max-width: 570px !important;
}

.students-workspace.has-detail .student-detail-panel {
  min-width: 0 !important;
  width: 100% !important;
}

.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  grid-template-columns: minmax(0, 1fr) 112px 30px !important;
  gap: 10px !important;
}

.students-workspace.has-detail .financial-cell {
  padding-left: 10px !important;
}

.students-workspace.has-detail .financial-label {
  font-size: 0.52rem !important;
}

.students-workspace.has-detail .financial-balance {
  font-size: 0.9rem !important;
}

.students-workspace.has-detail .student-copy strong {
  font-size: 0.88rem !important;
}

.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  height: 20px !important;
  padding-inline: 8px !important;
  font-size: 0.62rem !important;
}


/* v16 student command workspace: reference-card polish + bulk processing */
.students-workspace.has-detail {
  grid-template-columns: 570px minmax(0, 1fr) !important;
}

.students-workspace:not(.has-detail) {
  grid-template-columns: 860px !important;
  justify-content: center !important;
}

.list-columns,
.list-columns.full,
.list-columns.compact {
  grid-template-columns: minmax(0, 1fr) 154px 44px !important;
  padding: 0 22px 0 72px !important;
  height: 24px !important;
}

.student-list-scroll {
  padding: 12px 18px 24px 72px !important;
}

.student-list-scroll::before {
  left: 34px !important;
  top: 12px !important;
  bottom: 20px !important;
  width: 2px !important;
  background: linear-gradient(180deg, transparent, #dbe5f1 7%, #dbe5f1 93%, transparent) !important;
}

.student-row,
.student-row.full,
.student-row.compact,
.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  grid-template-columns: minmax(0, 1fr) 154px 44px !important;
  min-height: 102px !important;
  gap: 16px !important;
  margin: 0 0 12px 0 !important;
  border: 0 !important;
  border-bottom: 1px solid rgba(226, 232, 240, 0.92) !important;
  border-radius: 0 !important;
  background: linear-gradient(90deg, rgba(255,255,255,0.97), rgba(255,255,255,0.92)) !important;
  box-shadow: none !important;
  padding: 10px 10px 10px 20px !important;
  overflow: visible !important;
}

.student-row::before {
  content: '' !important;
  position: absolute !important;
  inset: 0 auto 0 -1px !important;
  width: 2px !important;
  border-radius: 999px !important;
  background: transparent !important;
}

.student-row:hover {
  border-color: rgba(214, 226, 240, 0.95) !important;
  background: linear-gradient(90deg, rgba(255,255,255,0.99), rgba(249,252,255,0.96)) !important;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.045) !important;
  transform: translateY(-1px) !important;
}

.student-row.selected,
.student-row.selected.multi-selected {
  border-bottom-color: rgba(185, 207, 253, 0.95) !important;
  background: linear-gradient(90deg, rgba(242,247,255,0.98), rgba(255,255,255,0.96)) !important;
  box-shadow: 0 12px 30px rgba(66, 115, 232, 0.10) !important;
}

.student-row.multi-selected:not(.selected) {
  border-bottom-color: color-mix(in srgb, var(--grade-border) 72%, #dbe7f6 28%) !important;
  background: linear-gradient(90deg, color-mix(in srgb, var(--grade-soft) 52%, #fff 48%), rgba(255,255,255,0.94)) !important;
}

.student-row.selected::before,
.student-row.multi-selected::before {
  background: var(--grade-accent) !important;
}

.student-identity,
.students-workspace.has-detail .student-identity {
  gap: 28px !important;
  align-items: center !important;
  min-width: 0 !important;
}

.row-select-toggle,
.students-workspace.has-detail .row-select-toggle {
  position: absolute !important;
  left: -45px !important;
  top: 50% !important;
  width: 26px !important;
  height: 26px !important;
  min-width: 26px !important;
  border: 2px solid #d6dee9 !important;
  border-radius: 999px !important;
  background: #fff !important;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.055) !important;
  opacity: 1 !important;
  transform: translateY(-50%) !important;
  z-index: 2 !important;
}

.row-select-toggle:hover {
  transform: translateY(-50%) scale(1.04) !important;
}

.row-select-toggle.active {
  border-color: #2f78ff !important;
  background: #2f78ff !important;
  box-shadow: 0 0 0 4px rgba(47,120,255,0.12), 0 8px 18px rgba(47,120,255,0.18) !important;
}

.row-select-toggle span {
  width: 9px !important;
  height: 6px !important;
  border-bottom: 2px solid currentColor !important;
  border-left: 2px solid currentColor !important;
}

.student-grade-mark,
.students-workspace.has-detail .student-grade-mark {
  width: 88px !important;
  height: 88px !important;
  flex: 0 0 88px !important;
  border: 1.5px solid var(--grade-border) !important;
  border-radius: 20px !important;
  background: linear-gradient(180deg, color-mix(in srgb, var(--grade-soft) 82%, #fff 18%), #ffffff) !important;
}

.student-grade-number,
.students-workspace.has-detail .student-grade-number {
  font-size: 2.55rem !important;
  line-height: 0.92 !important;
  font-weight: 820 !important;
  color: var(--grade-accent) !important;
}

.student-grade-label,
.students-workspace.has-detail .student-grade-label {
  margin-top: 8px !important;
  font-size: 0.78rem !important;
  letter-spacing: 0.12em !important;
  color: color-mix(in srgb, var(--grade-accent) 84%, #64748b 16%) !important;
}

.student-copy,
.students-workspace.has-detail .student-copy {
  gap: 12px !important;
  min-width: 0 !important;
}

.student-copy strong,
.students-workspace.has-detail .student-copy strong {
  display: block !important;
  overflow: hidden !important;
  color: #101d3b !important;
  font-size: 1.24rem !important;
  font-weight: 760 !important;
  line-height: 1.08 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.student-meta,
.students-workspace.has-detail .student-meta {
  gap: 12px !important;
}

.student-meta > span,
.student-meta small,
.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  height: 28px !important;
  max-width: 140px !important;
  border: 1px solid color-mix(in srgb, var(--grade-border) 70%, #e8eef6 30%) !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--grade-soft) 48%, #fff 52%) !important;
  color: var(--grade-accent) !important;
  padding: 0 13px !important;
  font-size: 0.78rem !important;
  font-weight: 740 !important;
}

.student-meta > span {
  color: color-mix(in srgb, var(--grade-accent) 78%, #52606f 22%) !important;
}

.student-section-badges {
  display: none !important;
}

.financial-cell,
.students-workspace.has-detail .financial-cell {
  min-height: 62px !important;
  justify-content: center !important;
  gap: 9px !important;
  border: 0 !important;
  border-left: 1px solid #dde5ee !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 0 0 0 26px !important;
  align-items: flex-start !important;
}

.financial-label,
.students-workspace.has-detail .financial-label {
  display: block !important;
  color: #73829a !important;
  font-size: 0.82rem !important;
  font-weight: 680 !important;
  line-height: 1 !important;
}

.financial-balance,
.financial-balance.danger,
.students-workspace.has-detail .financial-balance,
.students-workspace.has-detail .financial-balance.danger {
  color: var(--grade-accent) !important;
  font-size: 1.42rem !important;
  font-weight: 780 !important;
  line-height: 1 !important;
  letter-spacing: -0.02em !important;
}

.row-actions,
.students-workspace.has-detail .row-actions {
  justify-content: center !important;
  color: #9aa7b8 !important;
}

.row-actions button,
.students-workspace.has-detail .row-actions button {
  width: 40px !important;
  height: 40px !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 999px !important;
  background: rgba(255,255,255,0.95) !important;
  color: #6e7d92 !important;
  box-shadow: 0 7px 18px rgba(15, 23, 42, 0.055) !important;
  opacity: 1 !important;
}

.row-actions button:hover {
  color: #2f78ff !important;
  border-color: #c9dcff !important;
  background: #fff !important;
}

.row-actions button svg {
  width: 20px !important;
  height: 20px !important;
}

.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  grid-template-columns: minmax(0, 1fr) 128px 36px !important;
  min-height: 82px !important;
  gap: 10px !important;
  padding-left: 14px !important;
}

.students-workspace.has-detail .student-identity {
  gap: 16px !important;
}

.students-workspace.has-detail .student-grade-mark {
  width: 64px !important;
  height: 64px !important;
  flex-basis: 64px !important;
  border-radius: 17px !important;
}

.students-workspace.has-detail .student-grade-number {
  font-size: 2rem !important;
}

.students-workspace.has-detail .student-grade-label {
  margin-top: 4px !important;
  font-size: 0.56rem !important;
}

.students-workspace.has-detail .student-copy strong {
  font-size: 0.92rem !important;
}

.students-workspace.has-detail .student-meta {
  gap: 7px !important;
}

.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  height: 22px !important;
  max-width: 92px !important;
  padding: 0 8px !important;
  font-size: 0.58rem !important;
}

.students-workspace.has-detail .financial-cell {
  min-height: 48px !important;
  gap: 6px !important;
  padding-left: 12px !important;
}

.students-workspace.has-detail .financial-label {
  font-size: 0.58rem !important;
}

.students-workspace.has-detail .financial-balance {
  font-size: 0.94rem !important;
}

.students-workspace.has-detail .row-actions button {
  width: 32px !important;
  height: 32px !important;
}

.bulk-workspace-panel {
  overflow: hidden !important;
}

.bulk-workspace-card {
  display: flex !important;
  width: 100% !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  gap: 18px !important;
  padding: 22px !important;
  overflow: hidden !important;
}

.bulk-workspace-header {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 16px !important;
  border: 1px solid #e1ebf7 !important;
  border-radius: 22px !important;
  background: linear-gradient(135deg, #f8fbff, #fff) !important;
  padding: 18px 18px !important;
}

.bulk-workspace-header span {
  color: #2f78ff !important;
  font-size: 0.72rem !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
}

.bulk-workspace-header h2 {
  margin: 5px 0 4px !important;
  color: #12295c !important;
  font-size: 1.65rem !important;
  font-weight: 820 !important;
  letter-spacing: -0.04em !important;
}

.bulk-workspace-header p {
  margin: 0 !important;
  color: #73829a !important;
  font-size: 0.86rem !important;
  font-weight: 620 !important;
}

.bulk-metric-grid,
.bulk-payment-summary {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 12px !important;
}

.bulk-metric-grid article,
.bulk-payment-summary article {
  border: 1px solid #e6edf5 !important;
  border-radius: 18px !important;
  background: #fff !important;
  padding: 16px !important;
}

.bulk-metric-grid small,
.bulk-payment-summary small {
  display: block !important;
  color: #7a879a !important;
  font-size: 0.7rem !important;
  font-weight: 760 !important;
  margin-bottom: 8px !important;
}

.bulk-metric-grid strong,
.bulk-payment-summary strong {
  color: #12295c !important;
  font-size: 1.12rem !important;
  font-weight: 820 !important;
}

.bulk-command-row {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 12px !important;
}

.bulk-command {
  display: inline-flex !important;
  min-height: 52px !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 10px !important;
  border: 1px solid #dfe9f5 !important;
  border-radius: 18px !important;
  background: #fff !important;
  color: #52637a !important;
  font-weight: 780 !important;
}

.bulk-command.primary {
  border-color: transparent !important;
  background: linear-gradient(180deg, #2f78ff, #1f62eb) !important;
  color: #fff !important;
  box-shadow: 0 14px 28px rgba(47, 120, 255, 0.18) !important;
}

.bulk-selected-list {
  display: flex !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  gap: 8px !important;
  overflow-y: auto !important;
  padding-right: 4px !important;
}

.bulk-selected-list article {
  display: grid !important;
  grid-template-columns: 48px minmax(0, 1fr) auto !important;
  align-items: center !important;
  gap: 12px !important;
  border: 1px solid #e6edf5 !important;
  border-radius: 16px !important;
  background: #fff !important;
  padding: 10px 12px !important;
}

.bulk-grade {
  display: inline-flex !important;
  width: 42px !important;
  height: 42px !important;
  align-items: center !important;
  justify-content: center !important;
  border: 1px solid var(--grade-border) !important;
  border-radius: 14px !important;
  background: var(--grade-soft) !important;
  color: var(--grade-accent) !important;
  font-size: 1.25rem !important;
  font-weight: 820 !important;
}

.bulk-selected-list strong,
.bulk-payment-table strong {
  display: block !important;
  overflow: hidden !important;
  color: #16233d !important;
  font-size: 0.88rem !important;
  font-weight: 760 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.bulk-selected-list small,
.bulk-payment-table small {
  color: #7a879a !important;
  font-size: 0.72rem !important;
  font-weight: 640 !important;
}

.bulk-selected-list b {
  color: var(--grade-accent) !important;
  font-size: 0.95rem !important;
  font-weight: 800 !important;
}

.bulk-payment-controls {
  display: grid !important;
  grid-template-columns: 1.2fr 0.8fr 0.9fr !important;
  gap: 12px !important;
}

.bulk-payment-controls label {
  display: flex !important;
  flex-direction: column !important;
  gap: 7px !important;
  color: #67758a !important;
  font-size: 0.72rem !important;
  font-weight: 780 !important;
}

.bulk-payment-controls select,
.bulk-payment-controls input {
  height: 42px !important;
  border: 1px solid #dfe8f4 !important;
  border-radius: 14px !important;
  background: #fff !important;
  color: #16233d !important;
  padding: 0 12px !important;
  font-size: 0.86rem !important;
  font-weight: 680 !important;
}

.bulk-payment-table-wrap {
  min-height: 0 !important;
  flex: 1 1 auto !important;
  overflow: auto !important;
  border: 1px solid #e6edf5 !important;
  border-radius: 18px !important;
  background: #fff !important;
}

.bulk-payment-table {
  width: 100% !important;
  border-collapse: collapse !important;
}

.bulk-payment-table th {
  position: sticky !important;
  top: 0 !important;
  z-index: 1 !important;
  background: #f7faff !important;
  color: #7a879a !important;
  padding: 12px !important;
  font-size: 0.68rem !important;
  font-weight: 800 !important;
  text-align: left !important;
  text-transform: uppercase !important;
}

.bulk-payment-table td {
  border-top: 1px solid #edf2f7 !important;
  padding: 12px !important;
  color: #334155 !important;
}

.bulk-empty {
  color: #7a879a !important;
  text-align: center !important;
}

.bulk-payment-actions {
  display: flex !important;
  justify-content: flex-end !important;
  gap: 10px !important;
}

@media (max-width: 820px) {
  .students-workspace.has-detail {
    grid-template-columns: 1fr !important;
  }

  .bulk-metric-grid,
  .bulk-payment-summary,
  .bulk-command-row,
  .bulk-payment-controls {
    grid-template-columns: 1fr !important;
  }
}



/* Premium SaaS polish: cohesive KPI summary band for Matrícula + Ingresos del mes. */
.kpi-summary-system {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) clamp(205px, 17vw, 250px) !important;
  align-items: stretch !important;
  gap: clamp(10px, 1vw, 14px) !important;
  flex-shrink: 0 !important;
  margin: 0 0 10px !important;
  border: 1px solid rgba(219, 230, 244, 0.96) !important;
  border-radius: 18px !important;
  background:
    radial-gradient(circle at 14% 8%, rgba(142, 193, 83, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,251,255,0.94)) !important;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.055), inset 0 1px 0 rgba(255,255,255,0.85) !important;
  padding: clamp(10px, 1vw, 14px) !important;
  overflow: hidden !important;
}

.kpi-summary-system.without-income {
  grid-template-columns: minmax(0, 1fr) !important;
}

.kpi-cluster {
  display: flex !important;
  min-width: 0 !important;
  flex-direction: column !important;
  gap: 8px !important;
}

.kpi-cluster-header {
  display: grid !important;
  grid-template-columns: auto minmax(24px, 1fr) !important;
  align-items: center !important;
  gap: 10px !important;
  min-height: 14px !important;
  padding: 0 8px !important;
}

.kpi-cluster-header span {
  color: #41516c !important;
  font-size: 0.68rem !important;
  font-weight: 820 !important;
  letter-spacing: 0.055em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.kpi-cluster-header i {
  display: block !important;
  height: 1px !important;
  border-radius: 999px !important;
  background: linear-gradient(90deg, rgba(199, 211, 226, 0.82), rgba(199, 211, 226, 0)) !important;
}

.kpi-summary-system .kpi-grid {
  display: grid !important;
  grid-auto-flow: column !important;
  grid-auto-columns: minmax(126px, 1fr) !important;
  grid-template-columns: none !important;
  grid-template-rows: 1fr !important;
  gap: 0 !important;
  min-width: 0 !important;
  margin: 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  border: 1px solid rgba(226, 234, 244, 0.9) !important;
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.76) !important;
  padding: 6px !important;
  scrollbar-width: thin !important;
  scroll-snap-type: x proximity !important;
}

.kpi-summary-system .kpi-card {
  min-width: 126px !important;
  min-height: 62px !important;
  height: 100% !important;
  grid-template-columns: 34px minmax(0, 1fr) !important;
  gap: 9px !important;
  border: 1px solid transparent !important;
  border-radius: 12px !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 10px 12px !important;
  scroll-snap-align: start !important;
  transform: none !important;
}

.kpi-summary-system .kpi-card + .kpi-card {
  margin-left: 4px !important;
}

.kpi-summary-system .kpi-card::before {
  opacity: 0.06 !important;
  right: -34px !important;
  bottom: -34px !important;
}

.kpi-summary-system .kpi-card:hover {
  border-color: rgba(210, 221, 235, 0.9) !important;
  background: rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.045) !important;
}

.kpi-summary-system .kpi-card.active {
  border-color: rgba(96, 165, 76, 0.42) !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,252,244,0.96)) !important;
  box-shadow: inset 0 0 0 1px rgba(101, 167, 68, 0.16), 0 12px 24px rgba(52, 94, 45, 0.08) !important;
}

.kpi-summary-system .kpi-icon {
  width: 34px !important;
  height: 34px !important;
  border: 1px solid rgba(255, 255, 255, 0.72) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px rgba(15, 23, 42, 0.045) !important;
}

.kpi-summary-system .kpi-icon svg {
  width: 17px !important;
  height: 17px !important;
}

.kpi-summary-system .kpi-text {
  gap: 2px !important;
  justify-content: center !important;
}

.kpi-summary-system .kpi-text span {
  color: #4d5c72 !important;
  font-size: 0.62rem !important;
  font-weight: 820 !important;
  letter-spacing: 0.045em !important;
  text-transform: uppercase !important;
}

.kpi-summary-system .kpi-text strong {
  color: #14233d !important;
  font-size: 1.1rem !important;
  font-weight: 820 !important;
  line-height: 1.02 !important;
}

.kpi-summary-system .kpi-text em {
  color: #7f8a9c !important;
  font-size: 0.62rem !important;
  font-weight: 520 !important;
  line-height: 1.12 !important;
}

.kpi-summary-system .kpi-income-card,
.kpi-summary-system .monthly-income {
  width: auto !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 84px !important;
  align-self: stretch !important;
  border: 1px solid rgba(215, 228, 212, 0.95) !important;
  border-radius: 16px !important;
  background:
    linear-gradient(135deg, rgba(255,255,255,0.98), rgba(247,252,244,0.96)),
    radial-gradient(circle at 80% 20%, rgba(142, 193, 83, 0.18), transparent 36%) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.82), 0 12px 28px rgba(45, 78, 48, 0.06) !important;
  padding: 16px !important;
}

.kpi-summary-system .monthly-income span {
  color: #386339 !important;
  font-size: 0.66rem !important;
  font-weight: 840 !important;
  letter-spacing: 0.06em !important;
}

.kpi-summary-system .monthly-income strong {
  margin-top: 10px !important;
  color: #1f5b2a !important;
  font-size: clamp(1.05rem, 1.35vw, 1.42rem) !important;
  font-weight: 840 !important;
}

.kpi-summary-system .monthly-income svg {
  width: clamp(70px, 7vw, 104px) !important;
  height: 44px !important;
  opacity: 0.78 !important;
}

.kpi-summary-system .monthly-income polyline {
  stroke-width: 2.6 !important;
}

@media (max-width: 1180px) {
  .kpi-summary-system {
    grid-template-columns: 1fr !important;
  }

  .kpi-summary-system .monthly-income {
    min-height: 68px !important;
  }
}

@media (max-height: 920px) and (min-width: 1081px) {
  .kpi-summary-system {
    padding: 10px !important;
    margin-bottom: 8px !important;
  }

  .kpi-summary-system .kpi-card {
    min-height: 56px !important;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
  }

  .kpi-summary-system .kpi-income-card,
  .kpi-summary-system .monthly-income {
    min-height: 74px !important;
    padding: 12px 14px !important;
  }
}

/* Master-detail desktop refactor: optimized for 1280x800 effective CSS viewport. */
.students-screen,
.students-screen * {
  letter-spacing: 0 !important;
}

.students-screen {
  height: 100% !important;
  max-width: none !important;
  gap: 8px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

.students-hero {
  min-height: 38px !important;
  align-items: center !important;
  padding: 0 !important;
}

.hero-copy h1 {
  margin-bottom: 2px !important;
  color: #152640 !important;
  font-size: 1.14rem !important;
  font-weight: 840 !important;
}

.hero-copy p {
  font-size: 0.72rem !important;
  line-height: 1.3 !important;
}

.hero-actions {
  gap: 8px !important;
}

.new-student-button,
.section-manage-button {
  height: 34px !important;
  min-width: auto !important;
  border-radius: 10px !important;
  padding-inline: 12px !important;
  font-size: 0.76rem !important;
}

.section-manage-button svg,
.new-student-button svg {
  width: 16px !important;
  height: 16px !important;
}

.kpi-summary-system {
  grid-template-columns: minmax(0, 1fr) 190px !important;
  gap: 8px !important;
  margin: 0 !important;
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.86) !important;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.038) !important;
  padding: 8px !important;
}

.kpi-cluster {
  gap: 5px !important;
}

.kpi-cluster-header {
  min-height: 10px !important;
  padding: 0 4px !important;
}

.kpi-cluster-header span {
  font-size: 0.57rem !important;
  letter-spacing: 0 !important;
}

.kpi-summary-system .kpi-grid {
  display: grid !important;
  grid-auto-flow: initial !important;
  grid-auto-columns: initial !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 6px !important;
  overflow: hidden !important;
  border: 0 !important;
  background: transparent !important;
  padding: 0 !important;
}

.kpi-summary-system .kpi-section,
.kpi-summary-system .kpi-gray {
  display: none !important;
}

.kpi-summary-system .kpi-card {
  min-width: 0 !important;
  min-height: 54px !important;
  grid-template-columns: 30px minmax(0, 1fr) !important;
  gap: 8px !important;
  border: 1px solid #e7eef5 !important;
  border-radius: 12px !important;
  background: #fff !important;
  padding: 8px 9px !important;
}

.kpi-summary-system .kpi-icon {
  width: 30px !important;
  height: 30px !important;
}

.kpi-summary-system .kpi-text span {
  font-size: 0.56rem !important;
}

.kpi-summary-system .kpi-text strong {
  font-size: 1rem !important;
}

.kpi-summary-system .kpi-text em {
  display: none !important;
}

.kpi-summary-system .kpi-income-card,
.kpi-summary-system .monthly-income {
  min-height: 54px !important;
  border-radius: 12px !important;
  padding: 10px 12px !important;
}

.kpi-summary-system .monthly-income span {
  font-size: 0.56rem !important;
}

.kpi-summary-system .monthly-income strong {
  margin-top: 6px !important;
  font-size: 1.04rem !important;
}

.kpi-summary-system .monthly-income svg {
  display: none !important;
}

.filter-bar {
  grid-template-columns: minmax(250px, 330px) minmax(0, 1fr) auto !important;
  gap: 8px !important;
  min-height: 42px !important;
  margin: 0 !important;
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.9) !important;
  padding: 6px 8px !important;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.03) !important;
}

.search-control {
  height: 30px !important;
  margin: 0 !important;
  border-radius: 10px !important;
}

.grade-filter {
  gap: 4px !important;
  overflow: hidden !important;
}

.grade-tabs,
.group-tabs {
  flex-wrap: nowrap !important;
  gap: 5px !important;
  overflow: hidden !important;
  padding: 0 !important;
}

.group-tabs {
  border-top: 0 !important;
  padding-top: 2px !important;
}

.grade-tabs .chip,
.group-tabs .chip {
  padding: 5px 9px !important;
  font-size: 0.58rem !important;
}

.export-button {
  height: 30px !important;
  min-width: 108px !important;
  border-radius: 10px !important;
  font-size: 0.7rem !important;
}

.active-filter-strip {
  min-height: 0 !important;
  margin: 0 !important;
}

.filter-token {
  padding: 3px 8px !important;
  font-size: 0.6rem !important;
}

.students-scale-shell {
  min-height: 0 !important;
  flex: 1 1 auto !important;
  overflow: hidden !important;
  contain: none !important;
}

.students-design-canvas {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  transform: none !important;
}

.students-design-canvas > .students-workspace,
.students-workspace,
.students-workspace.has-detail {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  gap: 12px !important;
}

.students-workspace:not(.has-detail) {
  grid-template-columns: minmax(0, 760px) !important;
  justify-content: start !important;
}

.students-workspace.has-detail {
  grid-template-columns: minmax(360px, 392px) minmax(0, 1fr) !important;
}

.students-workspace.has-detail .student-list-panel,
.students-workspace.has-detail .student-list-panel.is-compact {
  max-width: 392px !important;
}

.student-list-card,
.student-detail-panel,
.students-workspace.has-detail .student-detail-panel {
  border-radius: 16px !important;
  border-color: #e2eaf4 !important;
  background: rgba(255, 255, 255, 0.96) !important;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.045) !important;
}

.list-titlebar {
  min-height: 40px !important;
  padding: 0 12px !important;
}

.list-heading h2 {
  font-size: 0.86rem !important;
}

.list-title-actions {
  gap: 5px !important;
}

.list-columns,
.list-columns.full,
.list-columns.compact {
  grid-template-columns: minmax(0, 1fr) 96px 28px !important;
  height: 20px !important;
  padding: 0 10px 0 46px !important;
  font-size: 0.5rem !important;
  letter-spacing: 0 !important;
}

.student-list-scroll {
  padding: 6px 8px 8px 46px !important;
}

.student-list-scroll::before {
  left: 24px !important;
  top: 8px !important;
  bottom: 8px !important;
  width: 1px !important;
}

.student-row,
.student-row.full,
.student-row.compact,
.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  grid-template-columns: minmax(0, 1fr) 96px 28px !important;
  min-height: 64px !important;
  gap: 8px !important;
  margin-bottom: 6px !important;
  border: 1px solid rgba(227, 234, 244, 0.9) !important;
  border-radius: 13px !important;
  background: linear-gradient(180deg, #ffffff, #fbfcfe) !important;
  padding: 8px 8px 8px 10px !important;
  box-shadow: none !important;
}

.student-row:hover {
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.045) !important;
}

.student-row::before {
  width: 3px !important;
  border-radius: 13px 0 0 13px !important;
}

.row-select-toggle,
.students-workspace.has-detail .row-select-toggle {
  left: -32px !important;
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
}

.student-identity,
.students-workspace.has-detail .student-identity {
  gap: 9px !important;
}

.student-grade-mark,
.students-workspace.has-detail .student-grade-mark {
  width: 44px !important;
  height: 44px !important;
  flex-basis: 44px !important;
  border-radius: 13px !important;
}

.student-grade-number,
.students-workspace.has-detail .student-grade-number {
  font-size: 1.48rem !important;
  letter-spacing: 0 !important;
}

.student-grade-label,
.students-workspace.has-detail .student-grade-label {
  margin-top: 2px !important;
  font-size: 0.44rem !important;
}

.student-copy,
.students-workspace.has-detail .student-copy {
  gap: 4px !important;
}

.student-copy strong,
.students-workspace.has-detail .student-copy strong {
  font-size: 0.78rem !important;
  line-height: 1.15 !important;
  white-space: nowrap !important;
}

.student-meta,
.students-workspace.has-detail .student-meta {
  gap: 5px !important;
}

.student-meta > span,
.student-meta small,
.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  height: 18px !important;
  max-width: 92px !important;
  padding: 0 7px !important;
  font-size: 0.55rem !important;
}

.student-section-badges {
  display: none !important;
}

.financial-cell,
.students-workspace.has-detail .financial-cell {
  height: 38px !important;
  min-height: 38px !important;
  gap: 4px !important;
  align-items: flex-end !important;
  border-left: 1px solid #e6edf5 !important;
  padding-left: 8px !important;
}

.financial-label,
.students-workspace.has-detail .financial-label {
  font-size: 0.5rem !important;
}

.financial-balance,
.financial-balance.danger,
.students-workspace.has-detail .financial-balance,
.students-workspace.has-detail .financial-balance.danger {
  font-size: 0.82rem !important;
}

.row-actions button,
.students-workspace.has-detail .row-actions button {
  width: 28px !important;
  height: 28px !important;
}

.row-actions button svg {
  width: 15px !important;
  height: 15px !important;
}

.list-footer {
  min-height: 28px !important;
  padding: 0 12px !important;
  font-size: 0.64rem !important;
}

@media (max-width: 1180px) {
  .kpi-summary-system {
    grid-template-columns: minmax(0, 1fr) 170px !important;
  }

  .students-workspace.has-detail {
    grid-template-columns: minmax(340px, 372px) minmax(0, 1fr) !important;
  }

  .students-workspace.has-detail .student-list-panel,
  .students-workspace.has-detail .student-list-panel.is-compact {
    max-width: 372px !important;
  }
}

@media (max-width: 980px) {
  .students-workspace.has-detail {
    grid-template-columns: 1fr !important;
    overflow-y: auto !important;
  }
}

/* KPI rail + readable list calibration: sections remain available even when many exist. */
.kpi-summary-system {
  align-items: start !important;
}

.kpi-summary-system .kpi-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
}

.kpi-summary-system .kpi-gray {
  display: grid !important;
}

.section-kpi-rail {
  display: flex !important;
  min-width: 0 !important;
  gap: 7px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  padding: 2px 2px 6px !important;
  scrollbar-color: rgba(101, 167, 68, 0.72) rgba(231, 240, 232, 0.92) !important;
  scrollbar-width: auto !important;
}

.section-kpi-card {
  display: inline-grid !important;
  min-width: 132px !important;
  max-width: 190px !important;
  height: 34px !important;
  flex: 0 0 auto !important;
  grid-template-columns: 24px minmax(0, 1fr) auto !important;
  align-items: center !important;
  gap: 7px !important;
  border: 1px solid #dcd7f1 !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #ffffff, #f7f5ff) !important;
  color: #57468d !important;
  padding: 0 10px 0 7px !important;
  box-shadow: 0 7px 16px rgba(71, 57, 135, 0.06) !important;
}

.section-kpi-card:hover {
  border-color: #c8bfef !important;
  background: #ffffff !important;
}

.section-kpi-card.active {
  border-color: #7c68d9 !important;
  background: linear-gradient(180deg, #f8f6ff, #ffffff) !important;
  box-shadow: inset 0 0 0 1px rgba(124, 104, 217, 0.18), 0 9px 18px rgba(71, 57, 135, 0.1) !important;
}

.section-kpi-icon {
  display: inline-flex !important;
  width: 24px !important;
  height: 24px !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 999px !important;
  background: #f0edff !important;
  color: #6554b8 !important;
}

.section-kpi-name {
  min-width: 0 !important;
  overflow: hidden !important;
  font-size: 0.66rem !important;
  font-weight: 780 !important;
  line-height: 1 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.section-kpi-card strong {
  color: #17233d !important;
  font-size: 0.82rem !important;
  font-weight: 840 !important;
  line-height: 1 !important;
}

.student-list-scroll {
  padding: 8px 10px 12px !important;
}

.student-list-scroll::before {
  display: none !important;
}

.list-columns,
.list-columns.full,
.list-columns.compact {
  grid-template-columns: minmax(0, 1fr) 96px 28px !important;
  padding: 0 12px !important;
}

.student-row,
.student-row.full,
.student-row.compact,
.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  min-height: 92px !important;
  overflow: visible !important;
  padding: 10px 8px 10px 42px !important;
}

.row-select-toggle,
.students-workspace.has-detail .row-select-toggle {
  left: 11px !important;
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  border-width: 2px !important;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.96), 0 8px 16px rgba(15, 23, 42, 0.08) !important;
}

.row-select-toggle:hover {
  border-color: var(--grade-accent) !important;
  transform: translateY(-50%) scale(1.08) !important;
}

.row-select-toggle.active {
  border-color: var(--grade-accent) !important;
  background: var(--grade-accent) !important;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--grade-accent) 18%, transparent), 0 10px 22px color-mix(in srgb, var(--grade-accent) 26%, transparent) !important;
}

.row-select-toggle.active span {
  opacity: 1 !important;
}

.student-copy strong,
.students-workspace.has-detail .student-copy strong {
  display: block !important;
  overflow: visible !important;
  color: #122033 !important;
  font-size: 0.82rem !important;
  line-height: 1.22 !important;
  text-overflow: clip !important;
  white-space: normal !important;
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
}

.student-row.multi-selected,
.student-row.selected.multi-selected,
.students-workspace.has-detail .student-row.multi-selected {
  border-color: color-mix(in srgb, var(--grade-accent) 55%, #dbe7f6 45%) !important;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--grade-soft) 58%, #ffffff 42%), #ffffff 72%),
    radial-gradient(circle at 96% 18%, color-mix(in srgb, var(--grade-accent) 14%, transparent), transparent 118px) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--grade-accent) 22%, transparent), 0 12px 28px rgba(15, 23, 42, 0.07) !important;
}

.student-row.multi-selected::after {
  content: "Seleccionado" !important;
  position: absolute !important;
  right: 48px !important;
  top: 8px !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--grade-accent) 14%, #ffffff 86%) !important;
  color: var(--grade-accent) !important;
  padding: 3px 7px !important;
  font-size: 0.52rem !important;
  font-weight: 820 !important;
  line-height: 1 !important;
}

.student-row.multi-selected .student-grade-mark {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--grade-accent) 12%, transparent) !important;
}

.students-screen :is(.student-list-scroll, .section-kpi-rail, .kpi-summary-system .kpi-grid, .bulk-selected-list, .bulk-payment-table-wrap, .profile-actions) {
  scrollbar-color: color-mix(in srgb, #65a744 76%, #397fe8 24%) rgba(231, 239, 233, 0.96) !important;
  scrollbar-width: auto !important;
}

.students-screen :is(.student-list-scroll, .section-kpi-rail, .kpi-summary-system .kpi-grid, .bulk-selected-list, .bulk-payment-table-wrap, .profile-actions)::-webkit-scrollbar {
  width: 14px !important;
  height: 12px !important;
}

.students-screen :is(.student-list-scroll, .section-kpi-rail, .kpi-summary-system .kpi-grid, .bulk-selected-list, .bulk-payment-table-wrap, .profile-actions)::-webkit-scrollbar-track {
  border-radius: 999px !important;
  background: linear-gradient(180deg, #eef6ec, #edf2f8) !important;
}

.students-screen :is(.student-list-scroll, .section-kpi-rail, .kpi-summary-system .kpi-grid, .bulk-selected-list, .bulk-payment-table-wrap, .profile-actions)::-webkit-scrollbar-thumb {
  border: 3px solid transparent !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #86c85b, #3e9b8c) padding-box !important;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.42) !important;
}

.students-screen :is(.student-list-scroll, .section-kpi-rail, .kpi-summary-system .kpi-grid, .bulk-selected-list, .bulk-payment-table-wrap, .profile-actions)::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #6ead4f, #2d8277) padding-box !important;
}

@media (max-width: 1180px) {
  .kpi-summary-system .kpi-grid {
    grid-template-columns: repeat(5, minmax(116px, 1fr)) !important;
    overflow-x: auto !important;
    padding-bottom: 4px !important;
  }
}


/* v18: give the student list ~20% more horizontal room when account details are open. */
.students-workspace.has-detail {
  grid-template-columns: minmax(440px, 470px) minmax(0, 1fr) !important;
}

.students-workspace.has-detail .student-list-panel,
.students-workspace.has-detail .student-list-panel.is-compact {
  max-width: 470px !important;
}

@media (max-width: 1180px) {
  .students-workspace.has-detail {
    grid-template-columns: minmax(390px, 430px) minmax(0, 1fr) !important;
  }

  .students-workspace.has-detail .student-list-panel,
  .students-workspace.has-detail .student-list-panel.is-compact {
    max-width: 430px !important;
  }
}

@media (max-width: 980px) {
  .students-workspace.has-detail {
    grid-template-columns: 1fr !important;
    overflow-y: auto !important;
  }

  .students-workspace.has-detail .student-list-panel,
  .students-workspace.has-detail .student-list-panel.is-compact {
    max-width: none !important;
  }
}

.secondary-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 10px;
}

.balance-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.balance-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #dfe6ef;
  border-radius: 999px;
  background: #fff;
  color: #536278;
  padding: 8px 12px;
  font-size: 0.77rem;
  font-weight: 720;
  line-height: 1;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.balance-chip b {
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #f4f7fb;
  color: inherit;
  padding: 0 7px;
  font-size: 0.72rem;
  font-weight: 800;
}

.balance-chip:hover,
.balance-chip.active {
  border-color: #acd29a;
  background: #f5fbf2;
  color: #2f6d2f;
  box-shadow: 0 10px 18px rgba(64, 112, 64, 0.06);
}

.balance-chip.active b {
  background: #e0f0d9;
}

.selection-mode-banner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #d6e4f8;
  border-radius: 999px;
  background: linear-gradient(180deg, #f8fbff, #ffffff);
  color: #476488;
  padding: 8px 12px;
  font-size: 0.78rem;
}

.selection-mode-banner strong {
  color: #1e4579;
}

.selection-clear-link {
  border: 0;
  background: transparent;
  color: #2f78ff;
  font-weight: 760;
}

.list-heading-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.list-heading-copy h2 {
  margin: 0;
}

.list-heading-copy small {
  color: #7d879b;
  font-size: 0.68rem;
  font-weight: 640;
  line-height: 1;
}

.selection-helper-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #edf2f7;
  background: #fafcff;
  padding: 10px 18px;
}

.selection-helper-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.selection-helper-copy strong {
  color: #1a355f;
  font-size: 0.82rem;
  font-weight: 760;
  line-height: 1;
}

.selection-helper-copy small {
  color: #7a869a;
  font-size: 0.72rem;
  font-weight: 600;
}

.selection-helper-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.helper-action {
  border: 1px solid #d9e2ee;
  border-radius: 999px;
  background: #fff;
  color: #44607f;
  padding: 7px 11px;
  font-size: 0.72rem;
  font-weight: 740;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.helper-action.muted {
  color: #6b7b91;
}

.helper-action:hover:not(:disabled) {
  border-color: #c9d6e6;
  background: #f7fbff;
}

.row-select-toggle {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border-color: #d5dce8;
  background: linear-gradient(180deg, #ffffff, #f9fbfd);
}

.row-select-toggle span {
  width: 12px;
  height: 7px;
  border-width: 2.5px;
  transform: rotate(-45deg) translate(0.5px, -0.5px);
}

.row-select-toggle.active {
  border-color: #2f9e44;
  background: linear-gradient(180deg, #68bb53, #4e9d3d);
  box-shadow: 0 10px 22px rgba(80, 158, 61, 0.22);
}

.student-row.multi-selected:not(.selected) {
  border-color: color-mix(in srgb, var(--grade-accent) 28%, #d7e1ed 72%);
  background: linear-gradient(135deg, color-mix(in srgb, var(--grade-soft) 42%, #ffffff 58%), rgba(255,255,255,0.98));
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.055);
}

.student-row.multi-selected::before,
.student-row.selected::before {
  content: '';
  position: absolute;
  inset: 12px auto 12px 0;
  width: 5px;
  border-radius: 0 999px 999px 0;
  background: var(--grade-accent);
  opacity: 0.95;
}

.student-selection-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--grade-soft) 80%, #ffffff 20%);
  color: var(--grade-accent);
  padding: 6px 10px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.selection-inline-summary {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.selection-inline-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.selection-inline-copy strong {
  color: #17335d;
  font-size: 0.84rem;
  font-weight: 780;
}

.selection-inline-copy small,
.selection-inline-totals span {
  color: #6d7a90;
  font-size: 0.74rem;
  font-weight: 650;
}

.list-footer.selection-footer {
  position: relative;
  margin-top: 10px;
  border-top: 1px solid #e5edf7;
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  border-radius: 0;
  background: #fbfdff;
  box-shadow: none;
  padding: 12px 17px 14px;
}

.selection-action-dock {
  position: fixed;
  left: 50%;
  bottom: 18px;
  z-index: 70;
  display: flex;
  width: min(1040px, calc(100vw - 24px));
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  transform: translateX(-50%);
  border: 1px solid #dce8f7;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.96);
  padding: 14px 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
}

.selection-action-dock__summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.selection-action-dock__count {
  display: inline-flex;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(180deg, #68bb53, #4e9d3d);
  color: #fff;
  font-size: 1rem;
  font-weight: 800;
  box-shadow: 0 14px 26px rgba(80, 158, 61, 0.24);
}

.selection-action-dock__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.selection-action-dock__copy strong {
  color: #17335d;
  font-size: 0.95rem;
  font-weight: 780;
}

.selection-action-dock__copy span {
  color: #6f7d93;
  font-size: 0.8rem;
  font-weight: 640;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selection-action-dock__actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.dock-action {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #d8e3f0;
  border-radius: 14px;
  background: #fff;
  color: #4e6078;
  padding: 0 14px;
  font-size: 0.82rem;
  font-weight: 760;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease, background 150ms ease;
}

.dock-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.dock-action.primary {
  border-color: transparent;
  background: linear-gradient(180deg, #68bb53, #4e9d3d);
  color: #fff;
  box-shadow: 0 14px 26px rgba(80, 158, 61, 0.2);
}

.dock-action.secondary {
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.dock-action.ghost {
  background: transparent;
}

.selection-dock-enter-active,
.selection-dock-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.selection-dock-enter-from,
.selection-dock-leave-to {
  opacity: 0;
  transform: translate(-50%, 14px);
}

@media (max-width: 920px) {
  .secondary-filter-bar,
  .selection-helper-strip,
  .selection-action-dock {
    flex-direction: column;
    align-items: stretch;
  }

  .selection-action-dock {
    bottom: 10px;
    width: calc(100vw - 16px);
  }

  .selection-action-dock__actions {
    justify-content: stretch;
  }

  .dock-action {
    flex: 1 1 auto;
  }
}


/* Compact filter and selection refinements */
.grade-tabs .chip-debt {
  gap: 7px;
}

.chip-debt i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ef6d76;
  box-shadow: 0 0 0 3px rgba(239, 109, 118, 0.13);
}

.chip-debt.active i {
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
}

.list-heading-copy small {
  display: none;
}

.selection-control-row {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf2f7;
  background: #fbfdff;
  padding: 9px 18px;
}

.select-visible-row-control {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
  border: 0;
  background: transparent;
  color: #6f7d93;
  padding: 0;
  font-size: 0.78rem;
  font-weight: 720;
  text-align: left;
}

.select-visible-row-control:hover {
  color: #2f7c3b;
}

.selection-control-row > strong {
  flex: 0 0 auto;
  color: #3b8d32;
  font-size: 0.78rem;
  font-weight: 780;
  white-space: nowrap;
}

.select-box {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #c9d3df;
  border-radius: 7px;
  background: #fff;
  color: #fff;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.select-box svg,
.row-select-toggle svg {
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.select-box svg {
  width: 15px;
  height: 15px;
  stroke-width: 3.2;
}

.select-box .check-mark,
.select-box .partial-mark {
  opacity: 0;
}

.select-visible-row-control.active .select-box,
.select-visible-row-control.partial .select-box {
  border-color: #4fa33e;
  background: linear-gradient(180deg, #68bb53, #4e9d3d);
  box-shadow: 0 8px 18px rgba(80, 158, 61, 0.18);
}

.select-visible-row-control.active .select-box .check-mark,
.select-visible-row-control.partial .select-box .partial-mark {
  opacity: 1;
}

.row-select-toggle {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 1.7px solid #cfd8e5;
  background: linear-gradient(180deg, #ffffff, #f9fbfd);
  color: #ffffff;
}

.row-select-toggle svg {
  width: 19px;
  height: 19px;
  stroke-width: 3.4;
  opacity: 0;
  transform: scale(0.86);
  transition: opacity 140ms ease, transform 140ms ease;
}

.row-select-toggle.active {
  border-color: #4fa33e;
  background: linear-gradient(180deg, #68bb53, #4e9d3d);
  box-shadow: 0 10px 22px rgba(80, 158, 61, 0.22);
}

.row-select-toggle.active svg {
  opacity: 1;
  transform: scale(1);
}

.student-row.compact .row-select-toggle {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 999px;
}

.student-row.compact .row-select-toggle svg {
  width: 16px;
  height: 16px;
  stroke-width: 3.5;
}

.student-row.compact .student-identity {
  gap: 10px;
}

@media (max-width: 720px) {
  .selection-control-row {
    padding: 9px 12px;
  }

  .select-visible-row-control {
    font-size: 0.74rem;
  }
}


/* v19 fixed student-list artboard + compact row polish.
   The list now scales as one canvas, like the sidebar, instead of letting row internals collapse independently. */
.students-scale-shell {
  height: var(--workspace-shell-height) !important;
  min-height: 0 !important;
  overflow: hidden !important;
  contain: layout paint !important;
}

.students-design-canvas {
  width: var(--workspace-design-width) !important;
  height: var(--workspace-design-height) !important;
  min-width: var(--workspace-design-width) !important;
  max-width: none !important;
  transform: scale(var(--workspace-scale)) !important;
  transform-origin: top left !important;
  will-change: transform !important;
}

.students-design-canvas > .students-workspace,
.students-workspace,
.students-workspace.has-detail {
  width: var(--workspace-design-width) !important;
  height: var(--workspace-design-height) !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.students-workspace:not(.has-detail) {
  grid-template-columns: 760px !important;
  justify-content: start !important;
}

.students-workspace.has-detail {
  grid-template-columns: 470px minmax(0, 1fr) !important;
}

.students-workspace.has-detail .student-list-panel,
.students-workspace.has-detail .student-list-panel.is-compact {
  width: 470px !important;
  max-width: 470px !important;
  flex-basis: 470px !important;
}

.student-list-card {
  border-radius: 18px !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,251,254,0.96)) !important;
}

.list-titlebar {
  min-height: 42px !important;
}

.selection-control-row {
  min-height: 38px !important;
  padding: 7px 14px !important;
}

.select-visible-row-control {
  gap: 9px !important;
  font-size: 0.72rem !important;
}

.select-visible-row-control span:last-child {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.list-columns,
.list-columns.full,
.list-columns.compact {
  grid-template-columns: minmax(0, 1fr) 104px 30px !important;
  height: 20px !important;
  padding: 0 12px 0 50px !important;
}

.student-list-scroll {
  padding: 8px 10px 12px !important;
}

.student-row,
.student-row.full,
.student-row.compact,
.students-workspace.has-detail .student-row,
.students-workspace.has-detail .student-row.full,
.students-workspace.has-detail .student-row.compact {
  grid-template-columns: minmax(0, 1fr) 104px 30px !important;
  min-height: 74px !important;
  gap: 9px !important;
  margin-bottom: 8px !important;
  overflow: visible !important;
  border-radius: 16px !important;
  padding: 9px 9px 9px 44px !important;
  box-shadow: 0 7px 18px rgba(15, 23, 42, 0.038) !important;
}

.student-row:hover {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06) !important;
}

.row-select-toggle,
.students-workspace.has-detail .row-select-toggle {
  left: 12px !important;
  top: 50% !important;
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  border-width: 2px !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  color: #ffffff !important;
  box-shadow: 0 0 0 4px rgba(255,255,255,0.96), 0 7px 14px rgba(15, 23, 42, 0.075) !important;
  transform: translateY(-50%) !important;
}

.row-select-toggle svg,
.students-workspace.has-detail .row-select-toggle svg {
  display: block !important;
  width: 16px !important;
  height: 16px !important;
  opacity: 0 !important;
  fill: none !important;
  stroke: #ffffff !important;
  stroke-width: 4.2 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
  transform: none !important;
  transition: opacity 120ms ease !important;
  pointer-events: none !important;
}

.row-select-toggle.active,
.students-workspace.has-detail .row-select-toggle.active {
  border-color: var(--grade-accent) !important;
  background: var(--grade-accent) !important;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--grade-accent) 18%, transparent), 0 10px 20px color-mix(in srgb, var(--grade-accent) 28%, transparent) !important;
}

.row-select-toggle.active svg,
.students-workspace.has-detail .row-select-toggle.active svg {
  opacity: 1 !important;
}

.student-identity,
.students-workspace.has-detail .student-identity {
  gap: 9px !important;
}

.student-grade-mark,
.students-workspace.has-detail .student-grade-mark {
  width: 46px !important;
  height: 46px !important;
  flex: 0 0 46px !important;
  border-radius: 14px !important;
}

.student-grade-number,
.students-workspace.has-detail .student-grade-number {
  font-size: 1.52rem !important;
}

.student-grade-label,
.students-workspace.has-detail .student-grade-label {
  margin-top: 2px !important;
  font-size: 0.43rem !important;
  letter-spacing: 0.13em !important;
}

.student-copy,
.students-workspace.has-detail .student-copy {
  gap: 4px !important;
}

.student-copy strong,
.students-workspace.has-detail .student-copy strong {
  display: -webkit-box !important;
  overflow: hidden !important;
  color: #122033 !important;
  font-size: 0.82rem !important;
  line-height: 1.17 !important;
  text-overflow: ellipsis !important;
  white-space: normal !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  line-clamp: 2 !important;
}

.student-meta,
.students-workspace.has-detail .student-meta {
  gap: 6px !important;
}

.student-meta > span,
.student-meta small,
.students-workspace.has-detail .student-meta > span,
.students-workspace.has-detail .student-meta small {
  height: 19px !important;
  max-width: 112px !important;
  padding: 0 8px !important;
  border-radius: 999px !important;
  font-size: 0.56rem !important;
  font-weight: 760 !important;
}

.student-meta .group-chip {
  min-width: 24px !important;
  justify-content: center !important;
  border: 1px solid color-mix(in srgb, var(--grade-border) 82%, #ffffff 18%) !important;
  background: color-mix(in srgb, var(--grade-soft) 74%, #ffffff 26%) !important;
  color: var(--grade-accent) !important;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.45) !important;
}

.financial-cell,
.students-workspace.has-detail .financial-cell {
  height: 38px !important;
  min-height: 38px !important;
  gap: 4px !important;
  padding-left: 8px !important;
}

.financial-label,
.students-workspace.has-detail .financial-label {
  font-size: 0.5rem !important;
}

.financial-balance,
.financial-balance.danger,
.students-workspace.has-detail .financial-balance,
.students-workspace.has-detail .financial-balance.danger {
  font-size: 0.84rem !important;
}

.row-actions button,
.students-workspace.has-detail .row-actions button {
  width: 30px !important;
  height: 30px !important;
  border-radius: 10px !important;
}

.student-row.multi-selected::after {
  content: none !important;
}

.student-row.multi-selected,
.student-row.selected.multi-selected,
.students-workspace.has-detail .student-row.multi-selected {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--grade-soft) 62%, #ffffff 38%), #ffffff 74%),
    radial-gradient(circle at 96% 18%, color-mix(in srgb, var(--grade-accent) 12%, transparent), transparent 96px) !important;
}

@media (max-width: 980px) {
  .students-workspace.has-detail {
    grid-template-columns: 760px !important;
  }

  .students-workspace.has-detail .student-list-panel,
  .students-workspace.has-detail .student-list-panel.is-compact {
    width: 760px !important;
    max-width: none !important;
    flex-basis: auto !important;
  }
}


/* v20 full-width workspace split.
   Keep the student list as a fixed visual unit, but let Estado de Cuenta take all
   remaining horizontal room instead of capping the combined canvas width. */
.students-scale-shell {
  width: 100% !important;
  max-width: none !important;
}

.students-design-canvas,
.students-design-canvas > .students-workspace,
.students-workspace,
.students-workspace.has-detail {
  max-width: none !important;
}

.students-workspace.has-detail {
  grid-template-columns: 470px minmax(0, 1fr) !important;
  justify-content: stretch !important;
}

.students-workspace.has-detail .student-detail-panel {
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
}

.students-workspace.has-detail .student-detail-panel > * {
  width: 100% !important;
  max-width: none !important;
}

</style>
