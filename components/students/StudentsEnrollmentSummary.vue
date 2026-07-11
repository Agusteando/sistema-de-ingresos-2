<template>
  <section class="student-detail-panel enrollment-summary-panel" aria-label="Resumen de inscripción por grado">
    <div class="enrollment-summary-shell">
      <div v-if="loading" class="enrollment-summary-loading" aria-live="polite" aria-label="Cargando resumen de inscripción">
        <span v-for="index in 4" :key="index"></span>
      </div>

      <div v-else-if="!summary.rows.length" class="enrollment-summary-empty">
        <span><LucideUsersRound :size="22" /></span>
        <div>
          <strong>Sin alumnos inscritos</strong>
          <p>No hay registros para el plantel y ciclo escolar seleccionados.</p>
        </div>
      </div>

      <div v-else class="enrollment-summary-table-wrap">
        <table class="enrollment-summary-table">
          <caption>{{ summaryCaption }}</caption>
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
                <div class="enrollment-grade-cell">
                  <button
                    type="button"
                    class="enrollment-grade-action"
                    :aria-label="`Filtrar por ${row.gradeLabel}`"
                    :aria-pressed="isActiveGrade(row)"
                    @click="$emit('select-grade', row.gradeValue)"
                  >
                    <span class="enrollment-grade-index">{{ gradeIndex(row) }}</span>
                    <strong>{{ row.gradeLabel }}</strong>
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
                      <b>{{ formatNumber(group.total) }}</b>
                    </button>
                  </div>
                </div>
              </th>
              <td>
                <button
                  type="button"
                  class="enrollment-count-cell"
                  :aria-label="`${row.gradeLabel}: ${row.internos} internos`"
                  @click="$emit('select-grade', row.gradeValue)"
                >
                  {{ formatNumber(row.internos) }}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="enrollment-count-cell"
                  :aria-label="`${row.gradeLabel}: ${row.externos} externos`"
                  @click="$emit('select-grade', row.gradeValue)"
                >
                  {{ formatNumber(row.externos) }}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="enrollment-count-cell is-total"
                  :aria-label="`${row.gradeLabel}: ${row.total} alumnos en total`"
                  @click="$emit('select-grade', row.gradeValue)"
                >
                  {{ formatNumber(row.total) }}
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr :class="{ 'is-active': !activeGrade && !activeGroup }">
              <th scope="row">
                <button
                  type="button"
                  class="enrollment-total-label"
                  title="Mostrar todos los grados"
                  @click="$emit('clear')"
                >
                  Total general
                </button>
              </th>
              <td><strong>{{ formatNumber(summary.internos) }}</strong></td>
              <td><strong>{{ formatNumber(summary.externos) }}</strong></td>
              <td><strong>{{ formatNumber(summary.total) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LucideUsersRound } from 'lucide-vue-next'
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
const summaryCaption = computed(() => {
  const scope = [props.plantelLabel, props.cicloLabel].filter(Boolean).join(', ')
  return scope ? `Inscripción por grado para ${scope}` : 'Inscripción por grado'
})
const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase('es')
const formatNumber = (value: number) => new Intl.NumberFormat('es-MX').format(Number(value || 0))
const gradeIndex = (row: EnrollmentSummaryRow) => row.sortIndex >= 0 && row.sortIndex < 6
  ? `${row.sortIndex + 1}°`
  : row.gradeLabel.slice(0, 1).toUpperCase()
const isActiveGrade = (row: EnrollmentSummaryRow) => normalized(props.activeGrade) === normalized(row.gradeValue)
const isActiveGroup = (row: EnrollmentSummaryRow, group: EnrollmentSummaryGroup) =>
  isActiveGrade(row) && normalized(props.activeGroup) === normalized(group.value)
</script>
