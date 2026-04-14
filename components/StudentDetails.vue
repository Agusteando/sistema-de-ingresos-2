<template>
  <div class="card">
    <div class="card-header" style="background: var(--neutral-canvas);">
      <div>
        <h3 style="font-size: 1.125rem; font-weight: 700; color: var(--brand-campus);">Cuenta Corriente: {{ student.nombreCompleto }}</h3>
        <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 4px;">Matrícula: <strong style="color: var(--accent-sky);">{{ student.matricula }}</strong> | Ciclo: {{ state.ciclo }}</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" @click="$emit('edit', student)">
          <LucideSettings size="16"/> Ajustar Perfil
        </button>
        <button class="btn btn-ghost" :disabled="!selectedDebts.length" @click="sendReminder">
          <LucideBell size="16"/> Emitir Recordatorio
        </button>
        <button class="btn btn-secondary" @click="showDocModal = true">
          <LucideFilePlus size="16"/> Asignar Cargo
        </button>
        <button class="btn btn-outline" :disabled="!selectedDebts.length" @click="showInvoiceModal = true">
          <LucideFileText size="16"/> Facturar
        </button>
        <button class="btn btn-primary" :disabled="!selectedDebts.length" @click="showPaymentModal = true">
          <LucideCreditCard size="16"/> Registrar Pago
        </button>
      </div>
    </div>
    
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 40px;"><input type="checkbox" @change="toggleAll" :checked="selectedDebts.length === validDebts.length && validDebts.length > 0"></th>
            <th style="width: 140px;">Porcentaje Liquidado</th>
            <th>Período</th>
            <th>Concepto Contractual</th>
            <th class="text-right">Monto Original</th>
            <th class="text-right">Suma Abonada</th>
            <th class="text-right">Saldo Restante</th>
            <th class="text-center">Control</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="text-center" style="padding: 3rem; color: var(--brand-teal);">Analizando historial financiero...</td>
          </tr>
          <tr v-else-if="!debts.length">
            <td colspan="8" class="text-center" style="padding: 3rem; color: #5B665E;">No se detectaron cargos asignados para este ciclo académico.</td>
          </tr>
          <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
            <tr>
              <td><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0"></td>
              <td>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? 'var(--brand-campus)' : 'var(--accent-gold)' }"></div>
                </div>
              </td>
              <td class="font-bold" style="color: var(--neutral-ink);">{{ debt.mesLabel }}</td>
              <td>
                {{ debt.conceptoNombre }}
                <span v-if="debt.hasRecargo" class="badge badge-warning" style="margin-left: 8px;">Mora Aplicada</span>
              </td>
              <td class="text-right">${{ format(debt.subtotal) }}</td>
              <td class="text-right font-bold text-success">${{ format(debt.pagos) }}</td>
              <td class="text-right font-bold" :class="debt.saldo > 0 ? 'text-danger' : ''">${{ format(debt.saldo) }}</td>
              <td class="text-center">
                <button v-if="debt.historialPagos?.length" class="btn btn-ghost" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" @click="toggleHistory(debt)">
                  <LucideHistory size="14"/> Bitácora
                </button>
              </td>
            </tr>
            <tr v-if="expandedHistory === `${debt.documento}-${debt.mes}`" style="background: #FAFBFA;">
              <td colspan="8" style="padding: 1rem 3rem;">
                <table style="background: var(--neutral-canvas); border-radius: var(--radius-sm); border: 1px solid var(--neutral-mist); box-shadow: var(--shadow-sm);">
                  <thead><tr><th>Folio Sistema</th><th>Fecha Emisión</th><th>Método de Pago</th><th class="text-right">Monto</th><th class="text-center">Anulación</th></tr></thead>
                  <tbody>
                    <tr v-for="h in debt.historialPagos" :key="h.folio">
                      <td style="font-family: monospace; font-weight: 600; color: var(--accent-sky);">#{{ h.folio }}</td>
                      <td>{{ new Date(h.fecha).toLocaleDateString() }}</td>
                      <td>{{ h.formaDePago }}</td>
                      <td class="text-right font-bold text-success">${{ format(h.monto) }}</td>
                      <td class="text-center">
                        <button class="btn btn-danger" style="padding: 4px 8px; font-size: 10px;" @click="cancelPayment(h)">Revertir Operación</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Orchestrated Modals -->
    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'

const props = defineProps({ student: Object })
const emit = defineEmits(['refresh', 'edit'])
const { show } = useToast()
const state = useState('globalState')

const debts = ref([])
const loading = ref(false)
const selectedDebts = ref([])
const expandedHistory = ref(null)

const showPaymentModal = ref(false)
const showDocModal = ref(false)
const showInvoiceModal = ref(false)

const format = (val) => Number(val || 0).toFixed(2)
const validDebts = computed(() => debts.value.filter(d => d.saldo > 0))

const loadDebts = async () => {
  loading.value = true
  selectedDebts.value = []
  try {
    debts.value = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: state.value.ciclo, lateFeeActive: state.value.lateFeeActive }
    })
  } catch (e) {
    show('Incapacidad para recuperar el expediente de cobro', 'danger')
  } finally {
    loading.value = false
  }
}

watch(() => [props.student, state.value.lateFeeActive], loadDebts, { immediate: true })

const toggleAll = (e) => { selectedDebts.value = e.target.checked ? [...validDebts.value] : [] }
const toggleHistory = (debt) => {
  const id = `${debt.documento}-${debt.mes}`
  expandedHistory.value = expandedHistory.value === id ? null : id
}

const cancelPayment = async (pago) => {
  const motivo = prompt('Por favor indique el motivo riguroso de la anulación:')
  if (!motivo) return
  try {
    await $fetch('/api/payments/cancel', { method: 'POST', body: { folio: pago.folio, motivo } })
    show('La transacción ha sido anulada con éxito en los registros')
    loadDebts()
    emit('refresh')
  } catch (e) {
    show('Fallo al ejecutar la anulación', 'danger')
  }
}

const sendReminder = async () => {
  if (!props.student.correo) {
    show('El alumno carece de correo registrado.', 'danger')
    return
  }
  try {
    const totalPendiente = selectedDebts.value.reduce((s, d) => s + d.saldo, 0)
    await $fetch('/api/reminders/send', {
      method: 'POST',
      body: {
        correo: props.student.correo,
        asunto: 'Aviso de Saldo Pendiente - IECS IEDIS',
        mensaje: `Le notificamos un saldo pendiente acumulado de $${totalPendiente.toFixed(2)} MXN relacionado a los conceptos seleccionados. Agradecemos su pronta atención.`
      }
    })
    show('El recordatorio institucional ha sido enviado.')
  } catch(e) {
    show('Problemas en el envío del correo', 'danger')
  }
}

const handleSuccess = () => {
  showPaymentModal.value = false
  showDocModal.value = false
  showInvoiceModal.value = false
  selectedDebts.value = []
  loadDebts()
  emit('refresh')
}
</script>