<template>
  <section class="student-detail-panel enrollment-summary-panel" aria-labelledby="enrollment-summary-title">
    <div class="enrollment-summary-shell">
      <header class="enrollment-summary-header">
        <div class="enrollment-summary-heading">
          <span class="enrollment-summary-mark" aria-hidden="true">
            <LucideChartNoAxesColumnIncreasing :size="22" />
          </span>
          <div>
            <span class="enrollment-summary-eyebrow">Panorama de inscripción</span>
            <h2 id="enrollment-summary-title">Composición por grado</h2>
            <p>Distribución de alumnos inscritos en el plantel y ciclo activos.</p>
          </div>
        </div>
        <div class="enrollment-summary-scope" aria-label="Alcance del resumen">
          <span><LucideBuilding2 :size="14" /> {{ plantelLabel || 'Plantel' }}</span>
          <span><LucideCalendarRange :size="14" /> {{ cicloLabel || 'Ciclo actual' }}</span>
        </div>
      </header>

      <div class="enrollment-summary-overview" aria-label="Totales de inscripción">
        <article class="is-interno">
          <span>Internos</span>
          <strong>{{ formatNumber(summary.internos) }}</strong>
          <small>{{ percent(summary.internos) }}% del total</small>
        </article>
        <article class="is-externo">
          <span>Externos</span>
          <strong>{{ formatNumber(summary.externos) }}</strong>
          <small>{{ percent(summary.externos) }}% del total</small>
        </article>
        <article class="is-total">
          <span>Total inscritos</span>
          <strong>{{ formatNumber(summary.total) }}</strong>
          <small>{{ summary.rows.length }} {{ summary.rows.length === 1 ? 'grado' : 'grados' }}</small>
        </article>
      </div>

      <div v-if="loading" class="enrollment-summary-loading" aria-live="polite">
        <span v-for="index in 5" :key="index"></span>
      </div>

      <div v-else-if="!summary.rows.length" class="enrollment-summary-empty">
        <span><LucideUsersRound :size="25" /></span>
        <div>
          <strong>Sin alumnos inscritos para resumir</strong>
          <p>El panel se actualizará automáticamente al cambiar de plantel o ciclo escolar.</p>
        </div>
      </div>

      <div v-else class="enrollment-summary-table-wrap">
        <table class="enrollment-summary-table">
          <thead>
            <tr>
              <th scope="col">Grado y grupos</th>
              <th scope="col"><span class="summary-column-dot is-interno"></span>Internos</th>
              <th scope="col"><span class="summary-column-dot is-externo"></span>Externos</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in summary.rows"
              :key="row.key"
              :class="{ 'is-active': isActiveGrade(row) }"
            >
              <th scope="row">
                <button
                  type="button"
                  class="enrollment-grade-action"
                  :aria-pressed="isActiveGrade(row)"
                  @click="$emit('select-grade', row.gradeValue)"
                >
                  <span class="enrollment-grade-index">{{ row.gradeLabel.slice(0, 1) }}</span>
                  <span class="enrollment-grade-copy">
                    <strong>{{ row.gradeLabel }}</strong>
                    <small v-if="row.nivel">{{ row.nivel }}</small>
                  </span>
                  <LucideArrowUpRight :size="14" aria-hidden="true" />
                </button>
                <div v-if="row.groups.length" class="enrollment-group-rail" aria-label="Grupos del grado">
                  <button
                    v-for="group in row.groups"
                    :key="group.key"
                    type="button"
                    :class="['enrollment-group-chip', { 'is-active': isActiveGroup(row, group) }]"
                    :title="`Grupo ${group.label}: ${group.total} alumnos`"
                    :aria-label="`Filtrar ${row.gradeLabel}, grupo ${group.label}, ${group.total} alumnos`"
                    :aria-pressed="isActiveGroup(row, group)"
                    @click.stop="$emit('select-group', { grade: row.gradeValue, group: group.value })"
                  >
                    <UiGroupIcon :label="group.value" />
                    <b>{{ group.total }}</b>
                  </button>
                </div>
              </th>
              <td>
                <button type="button" class="enrollment-count-cell is-interno" @click="$emit('select-grade', row.gradeValue)">
                  <strong>{{ formatNumber(row.internos) }}</strong>
                  <span :style="barStyle(row.internos, row.total)"></span>
                </button>
              </td>
              <td>
                <button type="button" class="enrollment-count-cell is-externo" @click="$emit('select-grade', row.gradeValue)">
                  <strong>{{ formatNumber(row.externos) }}</strong>
                  <span :style="barStyle(row.externos, row.total)"></span>
                </button>
              </td>
              <td>
                <button type="button" class="enrollment-total-cell" @click="$emit('select-grade', row.gradeValue)">
                  <strong>{{ formatNumber(row.total) }}</strong>
                  <LucideChevronRight :size="15" aria-hidden="true" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr :class="{ 'is-active': !activeGrade && !activeGroup }">
              <th scope="row">
                <button type="button" class="enrollment-total-label" @click="$emit('clear')">
                  <span><LucideSigma :size="17" /></span>
                  <span><strong>Total general</strong><small>Todos los grados</small></span>
                </button>
              </th>
              <td><strong>{{ formatNumber(summary.internos) }}</strong></td>
              <td><strong>{{ formatNumber(summary.externos) }}</strong></td>
              <td><strong>{{ formatNumber(summary.total) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="enrollment-summary-footer">
        <span><LucideMousePointerClick :size="14" /> Selecciona un grado o sigilo para filtrar la lista.</span>
        <button v-if="activeGrade || activeGroup" type="button" @click="$emit('clear')">
          <LucideRotateCcw :size="14" /> Todos los grados
        </button>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  LucideArrowUpRight,
  LucideBuilding2,
  LucideCalendarRange,
  LucideChartNoAxesColumnIncreasing,
  LucideChevronRight,
  LucideMousePointerClick,
  LucideRotateCcw,
  LucideSigma,
  LucideUsersRound,
} from 'lucide-vue-next'
import UiGroupIcon from '~/components/ui/UiGroupIcon.vue'
import type { EnrollmentSummaryResult, EnrollmentSummaryRow, EnrollmentSummaryGroup } from '~/shared/utils/enrollmentSummary'

const props = withDefaults(defineProps<{
  summary?: EnrollmentSummaryResult
  plantelLabel?: string
  cicloLabel?: string
  activeGrade?: string
  activeGroup?: string
  loading?: boolean
}>(), {
  summary: () => ({ rows: [], internos: 0, externos: 0, total: 0 }),
  plantelLabel: '',
  cicloLabel: '',
  activeGrade: '',
  activeGroup: '',
  loading: false,
})

defineEmits<{
  (event: 'select-grade', grade: string): void
  (event: 'select-group', payload: { grade: string; group: string }): void
  (event: 'clear'): void
}>()

const summary = computed(() => props.summary || { rows: [], internos: 0, externos: 0, total: 0 })
const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase('es')
const formatNumber = (value: number) => new Intl.NumberFormat('es-MX').format(Number(value || 0))
const percent = (value: number) => summary.value.total ? Math.round((Number(value || 0) / summary.value.total) * 100) : 0
const barStyle = (value: number, total: number) => ({ '--summary-bar': `${total ? Math.max(5, Math.round((value / total) * 100)) : 0}%` })
const isActiveGrade = (row: EnrollmentSummaryRow) => normalized(props.activeGrade) === normalized(row.gradeValue)
const isActiveGroup = (row: EnrollmentSummaryRow, group: EnrollmentSummaryGroup) =>
  isActiveGrade(row) && normalized(props.activeGroup) === normalized(group.value)
</script>
