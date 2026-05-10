<template>
  <section class="student-detail-panel bulk-workspace-panel bulk-payment-panel">
    <div class="bulk-workspace-card">
      <header class="bulk-workspace-header">
        <div>
          <span>Pago múltiple</span>
          <h2>{{ selectedCount }} alumnos seleccionados</h2>
          <p>Selecciona los conceptos a cobrar. Se genera un folio por concepto.</p>
        </div>
        <UiIconButton title="Cerrar pago múltiple" @click="$emit('back-to-bulk')"><LucideX :size="18" /></UiIconButton>
      </header>

      <div class="bulk-payment-controls concept-mode">
        <label>
          <span>Forma de pago</span>
          <select :value="bulkPaymentMethod" @change="$emit('change-bulk-payment-method', $event.target.value)">
            <option value="Efectivo">Efectivo</option>
            <option value="Tarjeta de débito">Tarjeta de Débito</option>
            <option value="Tarjeta de crédito">Tarjeta de Crédito</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Cheque">Cheque</option>
          </select>
        </label>
        <p>Selecciona conceptos por alumno.</p>
      </div>

      <div class="bulk-payment-summary">
        <article>
          <small>Total a registrar</small>
          <strong>${{ formatMoney(bulkPaymentTotal) }}</strong>
        </article>
        <article>
          <small>Alumnos con pago</small>
          <strong>{{ bulkPaymentStudentCount }}</strong>
        </article>
        <article>
          <small>Conceptos seleccionados</small>
          <strong>{{ bulkPaymentDebtCount }}</strong>
        </article>
      </div>

      <div class="bulk-payment-table-wrap">
        <table class="bulk-payment-table concept-payment-table">
          <thead>
            <tr>
              <th></th>
              <th>Alumno</th>
              <th>Concepto</th>
              <th class="money-cell">Monto final</th>
              <th class="money-cell">Saldo</th>
              <th class="money-cell">Pago</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="bulkPaymentLoading">
              <td colspan="6" class="bulk-empty">Cargando adeudos...</td>
            </tr>
            <tr v-else-if="!bulkPaymentRows.length">
              <td colspan="6" class="bulk-empty">Sin conceptos pendientes.</td>
            </tr>
            <tr v-else v-for="row in bulkPaymentRows" :key="row.key" :class="{ selected: row.selection.selected }">
              <td class="bulk-check-cell">
                <input v-model="row.selection.selected" type="checkbox" />
              </td>
              <td>
                <strong>{{ row.student.nombreCompleto }}</strong>
                <small>{{ row.student.matricula }}</small>
              </td>
              <td>
                <strong>{{ row.debt.conceptoNombre }}</strong>
                <small>{{ row.debt.mesLabel }}</small>
              </td>
              <td class="money-cell">
                <input
                  v-if="row.debt.montoFinalPendiente"
                  v-model.number="row.selection.montoFinal"
                  type="number"
                  min="0"
                  step="1"
                />
                <span v-else>${{ formatMoney(row.debt.subtotal) }}</span>
              </td>
              <td class="money-cell danger">${{ formatMoney(row.debt.saldo) }}</td>
              <td class="money-cell paid">
                <input
                  v-model.number="row.selection.montoPagado"
                  type="number"
                  min="0"
                  :max="row.debt.saldo"
                  step="0.01"
                  :disabled="!row.selection.selected"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bulk-payment-actions">
        <UiButton variant="secondary" :disabled="bulkPaymentProcessing" @click="$emit('back-to-bulk')">Volver</UiButton>
        <UiButton variant="primary" :disabled="bulkPaymentProcessing || bulkPaymentTotal <= 0 || bulkPaymentLoading" @click="$emit('submit-bulk-payments')">
          <LucideCreditCard :size="16" /> {{ bulkPaymentProcessing ? 'Registrando...' : 'Registrar pagos' }}
        </UiButton>
      </div>
    </div>
  </section>
</template>

<script setup>
import { LucideCreditCard, LucideX } from 'lucide-vue-next'
import { formatMoney } from '~/shared/utils/studentPresentation'
import UiButton from '~/components/ui/UiButton.vue'
import UiIconButton from '~/components/ui/UiIconButton.vue'

defineProps({
  selectedCount: { type: Number, default: 0 },
  bulkPaymentMethod: { type: String, default: 'Efectivo' },
  bulkPaymentTotal: { type: Number, default: 0 },
  bulkPaymentStudentCount: { type: Number, default: 0 },
  bulkPaymentDebtCount: { type: Number, default: 0 },
  bulkPaymentRows: { type: Array, default: () => [] },
  bulkPaymentLoading: { type: Boolean, default: false },
  bulkPaymentProcessing: { type: Boolean, default: false }
})

defineEmits(['change-bulk-payment-method', 'back-to-bulk', 'submit-bulk-payments'])
</script>
