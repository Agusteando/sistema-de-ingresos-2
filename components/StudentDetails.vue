<template>
  <div class="card">
    <div class="card-header">
      <div>
        <h3 style="font-size: 1rem; font-weight: 700; color: var(--brand-campus);">Cuenta: {{ student.nombreCompleto }}</h3>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" @click="$emit('edit', student)">Editar</button>
        <button class="btn btn-ghost" :disabled="!selectedDebts.length" @click="sendReminder">Recordatorio</button>
        <button class="btn btn-secondary" @click="showDocModal = true">Asignar Cargo</button>
        <button class="btn btn-outline" :disabled="!selectedDebts.length" @click="showInvoiceModal = true">Facturar</button>
        <button class="btn btn-primary" :disabled="!selectedDebts.length" @click="showPaymentModal = true">Pagar</button>
      </div>
    </div>
    
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 40px;"><input type="checkbox" @change="toggleAll" :checked="selectedDebts.length === validDebts.length && validDebts.length > 0"></th>
            <th style="width: 100px;">Estatus</th>
            <th>Mes</th>
            <th>Concepto</th>
            <th class="text-right">Cargo</th>
            <th class="text-right">Pagos</th>
            <th class="text-right">Saldo</th>
            <th class="text-center">Operaciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center" style="padding: 2rem;">Cargando...</td></tr>
          <tr v-else-if="!debts.length"><td colspan="8" class="text-center" style="padding: 2rem;">Sin cargos.</td></tr>
          <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
            <tr>
              <td><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0"></td>
              <td><div class="progress-track"><div class="progress-fill" :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? 'var(--brand-campus)' : 'var(--accent-gold)' }"></div></div></td>
              <td class="font-bold">{{ debt.mesLabel }}</td>
              <td>{{ debt.conceptoNombre }} <span v-if="debt.hasRecargo" class="badge badge-warning" style="margin-left: 4px;">Mora</span></td>
              <td class="text-right">${{ format(debt.subtotal) }}</td>
              <td class="text-right font-bold text-success">${{ format(debt.pagos) }}</td>
              <td class="text-right font-bold" :class="debt.saldo > 0 ? 'text-danger' : ''">${{ format(debt.saldo) }}</td>
              <td class="text-center"><button v-if="debt.historialPagos?.length" class="btn btn-ghost" style="padding: 0.25rem 0.5rem;" @click="toggleHistory(debt)">Ver</button></td>
            </tr>
            <tr v-if="expandedHistory === `${debt.documento}-${debt.mes}`" style="background: var(--bg-app);">
              <td colspan="8" style="padding: 1rem 3rem;">
                <table style="background: var(--neutral-canvas); border: 1px solid var(--border);">
                  <thead><tr><th>Folio</th><th>Fecha</th><th>Forma Pago</th><th class="text-right">Monto</th><th class="text-center">Acción</th></tr></thead>
                  <tbody>
                    <tr v-for="h in debt.historialPagos" :key="h.folio">
                      <td>#{{ h.folio }}</td><td>{{ new Date(h.fecha).toLocaleDateString() }}</td><td>{{ h.formaDePago }}</td>
                      <td class="text-right text-success">${{ format(h.monto) }}</td>
                      <td class="text-center"><button class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" @click="cancelPayment(h)">Anular</button></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
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
  } catch (e) { show('Error cargando cuenta', 'danger') } 
  finally { loading.value = false }
}

watch(() => [props.student, state.value.lateFeeActive], loadDebts, { immediate: true })

const toggleAll = (e) => { selectedDebts.value = e.target.checked ? [...validDebts.value] : [] }
const toggleHistory = (debt) => { const id = `${debt.documento}-${debt.mes}`; expandedHistory.value = expandedHistory.value === id ? null : id }

const cancelPayment = async (pago) => {
  const motivo = prompt('Motivo de anulación:')
  if (!motivo) return
  try {
    await $fetch('/api/payments/cancel', { method: 'POST', body: { folio: pago.folio, motivo } })
    show('Pago anulado')
    loadDebts(); emit('refresh')
  } catch (e) { show('Fallo al anular', 'danger') }
}

const sendReminder = async () => {
  if (!props.student.correo) return show('Sin correo', 'danger')
  try {
    const total = selectedDebts.value.reduce((s, d) => s + d.saldo, 0)
    await $fetch('/api/reminders/send', { method: 'POST', body: { correo: props.student.correo, asunto: 'Saldo Pendiente', mensaje: `Saldo: $${total.toFixed(2)} MXN.` } })
    show('Enviado.')
  } catch(e) { show('Error en envío', 'danger') }
}

const handleSuccess = () => {
  showPaymentModal.value = false; showDocModal.value = false; showInvoiceModal.value = false
  selectedDebts.value = []; loadDebts(); emit('refresh')
}
</script>