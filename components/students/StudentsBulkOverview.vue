<template>
  <section class="student-detail-panel bulk-workspace-panel">
    <div class="bulk-workspace-card">
      <header class="bulk-workspace-header">
        <div>
          <span>Procesar selección</span>
          <h2>{{ selectedCount }} alumnos</h2>
          <p>{{ selectedGradeSummary }}<template v-if="selectedGroupSummary"> · {{ selectedGroupSummary }}</template></p>
        </div>
        <UiIconButton title="Cerrar selección" @click="$emit('close-bulk')"><LucideX :size="18" /></UiIconButton>
      </header>

      <div class="bulk-metric-grid">
        <article>
          <small>Saldo total</small>
          <strong>${{ formatMoney(selectedBalanceTotal) }}</strong>
        </article>
        <article>
          <small>Promedio</small>
          <strong>${{ formatMoney(selectedAverageBalance) }}</strong>
        </article>
        <article>
          <small>Secciones</small>
          <strong>{{ selectedSectionSummary }}</strong>
        </article>
      </div>

      <div class="bulk-command-row">
        <button type="button" class="bulk-command primary" @click="$emit('open-bulk-payment')">
          <LucideCreditCard :size="18" />
          <span>Pagar selección</span>
        </button>
        <button type="button" class="bulk-command" @click="$emit('open-section-selection')">
          <LucideTags :size="18" />
          <span>Asignar secciones</span>
        </button>
        <button type="button" class="bulk-command" @click="$emit('clear-selected')">
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
          <b>${{ formatMoney(student.saldoNeto) }}</b>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup>
import { LucideCreditCard, LucideTags, LucideX } from 'lucide-vue-next'
import { formatMoney, gradeAccentStyle, gradeVisualNumber, studentGroupLabel } from '~/shared/utils/studentPresentation'
import UiIconButton from '~/components/ui/UiIconButton.vue'

defineProps({
  selectedCount: { type: Number, default: 0 },
  selectedGradeSummary: { type: String, default: '' },
  selectedGroupSummary: { type: String, default: '' },
  selectedBalanceTotal: { type: Number, default: 0 },
  selectedAverageBalance: { type: Number, default: 0 },
  selectedSectionSummary: { type: String, default: '' },
  selectedStudents: { type: Array, default: () => [] }
})

defineEmits(['close-bulk', 'open-bulk-payment', 'open-section-selection', 'clear-selected'])
</script>
