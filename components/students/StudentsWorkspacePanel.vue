<template>
  <Transition name="detail-flow" mode="out-in">
    <section v-if="accountWorkspaceMode === 'detail' && selectedStudent" :key="`detail-${selectedStudent.matricula}`" class="student-detail-panel">
      <StudentDetails
        :student="selectedStudent"
        :is-enrolled="isStudentEnrolled(selectedStudent, externalConcepts)"
        @refresh="$emit('refresh')"
        @edit="$emit('edit', $event)"
        @close="$emit('close-detail')"
        @switch-student="$emit('switch-student', $event)"
        @photo-loaded="$emit('photo-loaded', $event)"
        @baja="$emit('baja', $event)"
        @manage-sections="$emit('manage-sections', $event)"
      />
    </section>

    <StudentsBulkOverview
      v-else-if="accountWorkspaceMode === 'bulk'"
      key="bulk-overview"
      :selected-count="selectedCount"
      :selected-grade-summary="selectedGradeSummary"
      :selected-group-summary="selectedGroupSummary"
      :selected-balance-total="selectedBalanceTotal"
      :selected-average-balance="selectedAverageBalance"
      :selected-section-summary="selectedSectionSummary"
      :selected-students="selectedStudents"
      @close-bulk="$emit('close-bulk')"
      @open-bulk-payment="$emit('open-bulk-payment')"
      @open-section-selection="$emit('open-section-selection')"
      @clear-selected="$emit('clear-selected')"
    />

    <StudentsBulkPaymentPanel
      v-else-if="accountWorkspaceMode === 'bulk-payment'"
      key="bulk-payment"
      :selected-count="selectedCount"
      :bulk-payment-method="bulkPaymentMethod"
      :bulk-payment-total="bulkPaymentTotal"
      :bulk-payment-student-count="bulkPaymentStudentCount"
      :bulk-payment-debt-count="bulkPaymentDebtCount"
      :bulk-payment-rows="bulkPaymentRows"
      :bulk-payment-loading="bulkPaymentLoading"
      :bulk-payment-processing="bulkPaymentProcessing"
      @change-bulk-payment-method="$emit('change-bulk-payment-method', $event)"
      @back-to-bulk="$emit('back-to-bulk')"
      @submit-bulk-payments="$emit('submit-bulk-payments')"
    />
  </Transition>
</template>

<script setup>
import StudentDetails from '~/components/StudentDetails.vue'
import StudentsBulkOverview from '~/components/students/StudentsBulkOverview.vue'
import StudentsBulkPaymentPanel from '~/components/students/StudentsBulkPaymentPanel.vue'
import { isStudentEnrolled } from '~/shared/utils/studentPresentation'

defineProps({
  accountWorkspaceMode: { type: String, default: 'none' },
  selectedStudent: { type: Object, default: null },
  selectedCount: { type: Number, default: 0 },
  selectedGradeSummary: { type: String, default: '' },
  selectedGroupSummary: { type: String, default: '' },
  selectedBalanceTotal: { type: Number, default: 0 },
  selectedAverageBalance: { type: Number, default: 0 },
  selectedSectionSummary: { type: String, default: '' },
  selectedStudents: { type: Array, default: () => [] },
  bulkPaymentMethod: { type: String, default: 'Efectivo' },
  bulkPaymentTotal: { type: Number, default: 0 },
  bulkPaymentStudentCount: { type: Number, default: 0 },
  bulkPaymentDebtCount: { type: Number, default: 0 },
  bulkPaymentRows: { type: Array, default: () => [] },
  bulkPaymentLoading: { type: Boolean, default: false },
  bulkPaymentProcessing: { type: Boolean, default: false },
  externalConcepts: { type: Array, default: () => [] }
})

defineEmits([
  'refresh',
  'edit',
  'close-detail',
  'switch-student',
  'photo-loaded',
  'baja',
  'manage-sections',
  'close-bulk',
  'open-bulk-payment',
  'open-section-selection',
  'clear-selected',
  'change-bulk-payment-method',
  'back-to-bulk',
  'submit-bulk-payments'
])
</script>
