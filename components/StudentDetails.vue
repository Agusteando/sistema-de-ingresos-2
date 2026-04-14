<template>
  <div class="card mt-10">
    <div class="card-header">
      <div>
        <h3 class="text-lg font-bold text-brand-campus tracking-tight m-0">{{ student.nombreCompleto }}</h3>
        <p class="text-sm text-gray-500 mt-1 font-medium m-0">Matrícula: <strong class="text-accent-sky">{{ student.matricula }}</strong> | Grupo: {{ student.grado }} {{ student.grupo }}</p>
      </div>
      <div class="flex flex-wrap gap-2 md:justify-end">
        <button class="btn btn-ghost" @click="$emit('edit', student)"><LucideSettings :size="16"/> Editar</button>
        <button class="btn btn-ghost" :disabled="!selectedDebts.length" @click="sendReminder"><LucideBell :size="16"/> Recordatorio</button>
        <button class="btn btn-secondary" @click="showDocModal = true"><LucideFilePlus :size="16"/> Agregar documento</button>
        <button class="btn btn-outline" :disabled="!selectedDebts.length" @click="showInvoiceModal = true"><LucideFileText :size="16"/> Facturar</button>
        <button class="btn btn-primary" :disabled="!selectedDebts.length" @click="showPaymentModal = true"><LucideCreditCard :size="16"/> Pagar</button>
      </div>
    </div>
    
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="w-10 text-center"><input type="checkbox" @change="toggleAll" :checked="selectedDebts.length === validDebts.length && validDebts.length > 0" class="w-4 h-4 text-brand-leaf focus:ring-brand-leaf border-gray-300 rounded cursor-pointer"></th>
            <th class="w-[140px]">Progreso</th>
            <th>Mes</th>
            <th>Concepto</th>
            <th class="text-right">Monto Neto</th>
            <th class="text-right">Pagos</th>
            <th class="text-right">Saldo</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-brand-teal font-bold py-12">Cargando...</td></tr>
          <tr v-else-if="!debts.length"><td colspan="8" class="text-center text-gray-500 py-12">No hay documentos registrados para este ciclo.</td></tr>
          <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
            <tr :class="{ 'selected': selectedDebts.includes(debt) }"
                class="cursor-context-menu hover:bg-gray-50/50"
                @contextmenu.prevent="showDebtContextMenu($event, debt)">
              <td class="text-center"><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0" class="w-4 h-4 text-brand-leaf focus:ring-brand-leaf border-gray-300 rounded cursor-pointer"></td>
              <td>
                <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden shadow-inner"><div class="h-full transition-all duration-300 rounded-full" :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? '#4E844E' : '#FCBF2D' }"></div></div>
              </td>
              <td class="font-bold text-gray-700">{{ debt.mesLabel }}</td>
              <td class="text-gray-700">{{ debt.conceptoNombre }} <span v-if="debt.hasRecargo" class="badge badge-warning ml-2">Recargo</span></td>
              <td class="text-right text-gray-700">${{ format(debt.subtotal) }}</td>
              <td class="text-right font-bold text-brand-campus">${{ format(debt.pagos) }}</td>
              <td :class="['text-right font-bold', debt.saldo > 0 ? 'text-accent-coral' : 'text-gray-700']">${{ format(debt.saldo) }}</td>
              <td class="text-center">
                <button v-if="debt.historialPagos?.length" class="btn btn-ghost px-2 py-1 text-xs" @click="toggleHistory(debt)"><LucideHistory :size="14"/> Historial</button>
              </td>
            </tr>
            <tr v-if="expandedHistory === `${debt.documento}-${debt.mes}`" class="bg-gray-50/50 border-b-0 transition-all">
              <td colspan="8" class="p-6">
                <table class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden m-0 w-full">
                  <thead class="bg-gray-50/80"><tr><th class="py-3 text-gray-500 border-b border-gray-100">Folio</th><th class="py-3 text-gray-500 border-b border-gray-100">Fecha</th><th class="py-3 text-gray-500 border-b border-gray-100">Forma de Pago</th><th class="text-right py-3 text-gray-500 border-b border-gray-100">Monto</th><th class="text-center py-3 text-gray-500 border-b border-gray-100">Opciones</th></tr></thead>
                  <tbody>
                    <tr v-for="h in debt.historialPagos" :key="h.folio" 
                        class="hover:bg-gray-50 transition-colors cursor-context-menu"
                        @contextmenu.prevent="showHistoryContextMenu($event, h)">
                      <td class="font-mono font-bold text-accent-sky py-3 border-b border-gray-100">#{{ h.folio }}</td>
                      <td class="py-3 border-b border-gray-100 text-gray-700">{{ new Date(h.fecha).toLocaleDateString() }}</td>
                      <td class="py-3 border-b border-gray-100 text-gray-700">{{ h.formaDePago }}</td>
                      <td class="text-right font-bold text-brand-campus py-3 border-b border-gray-100">${{ format(h.monto) }}</td>
                      <td class="text-center py-3 border-b border-gray-100">
                        <button class="btn btn-outline px-3 py-1 text-[11px] mr-2" @click="reprintPayment(h)"><LucidePrinter :size="12" class="mr-1 inline-block"/> Imprimir</button>
                        <button class="btn btn-danger px-3 py-1 text-[11px]" @click="cancelPayment(h)"><LucideUndo :size="12" class="mr-1 inline-block"/> Cancelar</button>
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

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell, LucidePrinter, LucideUndo } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'

const props = defineProps({ student: Object })
const emit = defineEmits(['refresh', 'edit'])
const { show } = useToast()
const { openMenu } = useContextMenu()
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
  loading.value = true; selectedDebts.value =[]
  try {
    debts.value = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: state.value.ciclo, lateFeeActive: state.value.lateFeeActive }
    })
  } catch (e) { show('Error al cargar datos del alumno', 'danger') } 
  finally { loading.value = false }
}

watch(() =>[props.student, state.value.lateFeeActive], loadDebts, { immediate: true })

const toggleAll = (e) => { selectedDebts.value = e.target.checked ? [...validDebts.value] :[] }
const toggleHistory = (debt) => { const id = `${debt.documento}-${debt.mes}`; expandedHistory.value = expandedHistory.value === id ? null : id }

const reprintPayment = (pago) => {
  window.open(`/print/recibo?folios=${pago.folio}`, '_blank', 'width=850,height=800')
}

const cancelPayment = async (pago) => {
  const motivo = prompt('Por favor, indique el motivo de la cancelación:')
  if (!motivo) return
  try {
    await $fetch('/api/payments/cancel', { method: 'POST', body: { folio: pago.folio, motivo } })
    show('El pago ha sido cancelado')
    loadDebts(); emit('refresh')
  } catch (e) { show('Error al cancelar pago', 'danger') }
}

const sendReminder = async () => {
  if (!props.student.correo) return show('No hay un correo registrado', 'danger')
  try {
    const total = selectedDebts.value.reduce((s, d) => s + d.saldo, 0)
    await $fetch('/api/reminders/send', { method: 'POST', body: { correo: props.student.correo, asunto: 'Recordatorio de pago - IECS IEDIS', mensaje: `Le recordamos que el alumno presenta un saldo pendiente de $${total.toFixed(2)} MXN.` } })
    show('Recordatorio enviado exitosamente.')
  } catch(e) { show('Error al enviar correo', 'danger') }
}

const showDebtContextMenu = (event, debt) => {
  const canPay = debt.saldo > 0
  openMenu(event, [
    { label: canPay ? 'Pagar este cargo' : 'Completado', icon: LucideCreditCard, disabled: !canPay, action: () => { selectedDebts.value = [debt]; showPaymentModal.value = true } },
    { label: 'Facturar', icon: LucideFileText, action: () => { selectedDebts.value = [debt]; showInvoiceModal.value = true } },
    { label: 'Historial', icon: LucideHistory, action: () => toggleHistory(debt) }
  ])
}

const showHistoryContextMenu = (event, h) => {
  openMenu(event, [
    { label: 'Imprimir', icon: LucidePrinter, action: () => reprintPayment(h) },
    { label: 'Cancelar', icon: LucideUndo, class: 'text-accent-coral', action: () => cancelPayment(h) }
  ])
}

const handleSuccess = () => {
  showPaymentModal.value = false; showDocModal.value = false; showInvoiceModal.value = false
  selectedDebts.value =[]; loadDebts(); emit('refresh')
}
</script>